#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

from scripts import stem_flute_lab as base


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "stem-flute-lab"
CLIP_SECONDS = base.CLIP_SECONDS
TARGET_SR = base.TARGET_SR


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def extract_clip(source, start, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{float(start):.3f}",
        "-t", f"{CLIP_SECONDS:.3f}",
        "-i", str(source),
        "-vn", "-ac", "2", "-ar", str(TARGET_SR),
        "-c:a", "pcm_s16le",
        str(target),
    ])


def mix_wavs(inputs, target, limit=0.91):
    inputs = [Path(item) for item in inputs if item and Path(item).exists()]
    if not inputs:
        raise RuntimeError("Nenhum áudio disponível para a mistura.")

    target.parent.mkdir(parents=True, exist_ok=True)
    if len(inputs) == 1:
        run([
            "ffmpeg", "-y", "-v", "error",
            "-i", str(inputs[0]),
            "-t", f"{CLIP_SECONDS:.3f}",
            "-ac", "2", "-ar", str(TARGET_SR),
            "-c:a", "pcm_s16le",
            str(target),
        ])
        return

    cmd = ["ffmpeg", "-y", "-v", "error"]
    for item in inputs:
        cmd += ["-i", str(item)]

    refs = []
    filters = []
    for index in range(len(inputs)):
        tag = f"a{index}"
        filters.append(f"[{index}:a]aresample={TARGET_SR},volume=1.0[{tag}]")
        refs.append(f"[{tag}]")

    filters.append(
        "".join(refs)
        + f"amix=inputs={len(inputs)}:duration=longest:normalize=0,"
        + f"alimiter=limit={limit}[out]"
    )

    cmd += [
        "-filter_complex", ";".join(filters),
        "-map", "[out]",
        "-t", f"{CLIP_SECONDS:.3f}",
        "-ac", "2", "-ar", str(TARGET_SR),
        "-c:a", "pcm_s16le",
        str(target),
    ]
    run(cmd)


def make_silence(target):
    frames = int(round(CLIP_SECONDS * TARGET_SR))
    sf.write(
        target,
        np.zeros((frames, 2), dtype=np.float32),
        TARGET_SR,
        subtype="PCM_16",
    )


def duration_seconds(path):
    try:
        out = subprocess.check_output([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ], text=True).strip()
        return float(out)
    except Exception:
        return 0.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-json", required=True)
    parser.add_argument("--paths-json", required=True)
    args = parser.parse_args()

    request = json.loads(Path(args.request_json).read_text(encoding="utf-8"))
    local_paths = {
        key: Path(value)
        for key, value in json.loads(Path(args.paths_json).read_text(encoding="utf-8")).items()
        if value
    }

    required = ["drums", "bass", "vocals"]
    missing = [key for key in required if key not in local_paths or not local_paths[key].exists()]
    if missing:
        raise SystemExit("Stems obrigatórios ausentes: " + ", ".join(missing))

    instrument_keys = [key for key in ("guitar", "piano", "other") if key in local_paths and local_paths[key].exists()]
    if not instrument_keys:
        raise SystemExit("Envie pelo menos um stem de instrumentos: guitar, piano ou other.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mdd-manual-stems-") as tmp:
        work = Path(tmp)
        reconstructed_full = work / "full-source.wav"

        source_parts = [
            local_paths["drums"],
            local_paths["bass"],
            *[local_paths[key] for key in instrument_keys],
            local_paths["vocals"],
        ]

        # Para seleção automática do trecho, usamos o mix original enviado quando
        # existir; caso contrário, reconstruímos a música somando todos os stems.
        analysis_source = local_paths.get("original")
        if analysis_source is None or not analysis_source.exists():
            cmd = ["ffmpeg", "-y", "-v", "error"]
            for item in source_parts:
                cmd += ["-i", str(item)]
            refs = []
            chains = []
            for index in range(len(source_parts)):
                tag = f"s{index}"
                chains.append(f"[{index}:a]aresample={TARGET_SR},volume=1.0[{tag}]")
                refs.append(f"[{tag}]")
            chains.append(
                "".join(refs)
                + f"amix=inputs={len(source_parts)}:duration=longest:normalize=0,"
                + "alimiter=limit=0.92[out]"
            )
            cmd += [
                "-filter_complex", ";".join(chains),
                "-map", "[out]",
                "-ac", "2", "-ar", str(TARGET_SR),
                "-c:a", "pcm_s16le",
                str(reconstructed_full),
            ]
            run(cmd)
            analysis_source = reconstructed_full

        requested_start = request.get("clipStart")
        if requested_start is None or str(requested_start).strip() == "":
            clip_start, choice = base.choose_clip_start(analysis_source, work)
            choice["mode"] = "automatic"
        else:
            clip_start = max(0.0, float(requested_start))
            duration = duration_seconds(analysis_source)
            if duration > 0:
                clip_start = min(clip_start, max(0.0, duration - CLIP_SECONDS))
            choice = {
                "duration": round(duration, 3),
                "candidates": 1,
                "score": 1.0,
                "mode": "manual",
            }

        clipped = {}
        for key in ("drums", "bass", "vocals", "guitar", "piano", "other"):
            target = work / f"{key}.wav"
            if key in local_paths and local_paths[key].exists():
                extract_clip(local_paths[key], clip_start, target)
                clipped[key] = target
            elif key in ("guitar", "piano", "other"):
                make_silence(target)
                clipped[key] = target

        original_clip = work / "original.wav"
        if "original" in local_paths and local_paths["original"].exists():
            extract_clip(local_paths["original"], clip_start, original_clip)
        else:
            mix_wavs(
                [clipped["drums"], clipped["bass"]]
                + [clipped[key] for key in instrument_keys]
                + [clipped["vocals"]],
                original_clip,
                limit=0.92,
            )

        instruments_wav = work / "instruments.wav"
        mix_wavs([clipped[key] for key in instrument_keys], instruments_wav, limit=0.91)

        flute_wav = work / "flute.wav"
        flute_stats = base.synthesize_flute(clipped["vocals"], flute_wav)

        preview_wav = work / "preview.wav"
        mix_wavs(
            [clipped["drums"], clipped["bass"], instruments_wav, flute_wav],
            preview_wav,
            limit=0.91,
        )

        game_round_1 = work / "game-round-1.wav"
        game_round_2 = work / "game-round-2.wav"
        game_round_3 = work / "game-round-3.wav"
        game_round_4 = work / "game-round-4.wav"
        game_round_5 = original_clip

        mix_wavs([clipped["drums"]], game_round_1)
        mix_wavs([clipped["drums"], clipped["bass"]], game_round_2)
        mix_wavs([clipped["drums"], clipped["bass"], instruments_wav], game_round_3)
        mix_wavs([clipped["drums"], clipped["bass"], instruments_wav, flute_wav], game_round_4)

        # O publicador atual espera estes arquivos. Os opcionais ausentes ficam
        # silenciosos, mas não aparecem como opção individual no manifesto.
        output_sources = {
            "preview": preview_wav,
            "flute": flute_wav,
            "drums": clipped["drums"],
            "bass": clipped["bass"],
            "instruments": instruments_wav,
            "guitar": clipped["guitar"],
            "piano": clipped["piano"],
            "other": clipped["other"],
            "vocals": clipped["vocals"],
            "original": original_clip,
        }

        labels = {
            "preview": "Mix sem voz + flauta",
            "flute": "Melodia em flauta",
            "drums": "Bateria",
            "bass": "Baixo",
            "instruments": "Instrumentos completos",
            "guitar": "Guitarra / violão",
            "piano": "Piano / teclas",
            "other": "Outros instrumentos",
            "vocals": "Voz enviada",
            "original": "Trecho original",
        }

        visible_tracks = ["preview", "flute", "drums", "bass", "instruments"]
        visible_tracks += instrument_keys
        visible_tracks += ["vocals", "original"]

        tracks = []
        for key, source in output_sources.items():
            target = OUT_DIR / f"{key}.ogg"
            base.encode_ogg(source, target)
            if key in visible_tracks:
                tracks.append({
                    "id": key,
                    "label": labels[key],
                    "url": f"/stem-flute-lab/{key}.ogg",
                })

        for index, source in enumerate(
            [game_round_1, game_round_2, game_round_3, game_round_4, game_round_5],
            start=1,
        ):
            base.encode_ogg(source, OUT_DIR / f"game-round-{index}.ogg")

        repo_paths = request.get("stemPaths") if isinstance(request.get("stemPaths"), dict) else {}
        source_name = Path(
            str(repo_paths.get("original") or repo_paths.get("vocals") or "stems-enviados")
        ).name

        manifest = {
            "version": 2,
            "mode": "manual-stems",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceName": source_name,
            "sourcePath": str(request.get("sourcePath") or repo_paths.get("vocals") or ""),
            "clipStart": round(float(clip_start), 3),
            "clipSeconds": CLIP_SECONDS,
            "selection": choice,
            "separationModel": "Stems enviados manualmente · sem separação automática",
            "voiceTransform": "neural stabilized flute (TorchCrepe full + pYIN fallback, no MIDI)",
            "instrumentBody": "stems originais enviados pelo usuário",
            "webAudioEncoding": "Ogg Vorbis q8",
            "flute": flute_stats,
            "manualStemPaths": repo_paths,
            "availableLayers": ["drums", "bass", "instruments", *instrument_keys, "flute"],
            "tracks": tracks,
            "gameRounds": [
                {"index": 1, "label": "Bateria", "url": "/stem-flute-lab/game-round-1.ogg"},
                {"index": 2, "label": "Baixo", "url": "/stem-flute-lab/game-round-2.ogg"},
                {"index": 3, "label": "Instrumentos", "url": "/stem-flute-lab/game-round-3.ogg"},
                {"index": 4, "label": "Melodia", "url": "/stem-flute-lab/game-round-4.ogg"},
                {"index": 5, "label": "Revelação", "url": "/stem-flute-lab/game-round-5.ogg"},
            ],
        }

        (OUT_DIR / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print("Manual Stems + Flauta Lab pronto.", flush=True)


if __name__ == "__main__":
    main()
