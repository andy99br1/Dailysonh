#!/usr/bin/env python3
import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

import process_upload as pu


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "separation-tests" / "lab"
CLIP_SECONDS = pu.CLIP_SECONDS
CONTEXT_PADDING = 9.0
CONTEXT_SECONDS = CLIP_SECONDS + (CONTEXT_PADDING * 2.0)


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def audio_duration(source):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        return max(0.0, float(result.stdout.strip()))
    except ValueError:
        return 0.0


def extract_window(source, start, duration, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{max(0.0, start):.3f}",
        "-t", f"{max(0.1, duration):.3f}",
        "-i", source,
        "-vn", "-ac", "2", "-ar", "44100",
        "-c:a", "pcm_s16le",
        output,
    ])
    return output


def crop_wav(source, start, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{max(0.0, start):.3f}",
        "-t", f"{CLIP_SECONDS:.3f}",
        "-i", source,
        "-vn", "-ac", "2", "-ar", "44100",
        "-c:a", "pcm_s16le",
        output,
    ])
    return output


def separate_demucs_model(audio, work, model, names):
    out = work / ("demucs-" + model)
    run([
        sys.executable, "-m", "demucs.separate",
        "-n", model,
        "--device", "cpu",
        "--out", out,
        audio,
    ])

    stem_dir = out / model / audio.stem
    stems = {name: stem_dir / f"{name}.wav" for name in names}
    missing = [name for name, path in stems.items() if not path.exists()]
    if missing:
        raise RuntimeError(f"{model} não gerou: " + ", ".join(missing))
    return stems


def crop_stems(stems, offset, work, prefix):
    cropped = {}
    out = work / ("cropped-" + prefix)
    for name, path in stems.items():
        cropped[name] = crop_wav(path, offset, out / f"{name}.wav")
    return cropped


def stem_energy(path):
    y, _sr = sf.read(path, dtype="float32", always_2d=True)
    if not len(y):
        return 0.0
    mono = np.mean(y, axis=1)
    return float(np.sqrt(np.mean(np.square(mono), dtype=np.float64)))


def build_six_stem_rounds(original_clip, stems, target):
    target.mkdir(parents=True, exist_ok=True)
    melody = target / "_melody.wav"

    pu.synthesize_vocal_melody(stems["vocals"], melody)

    candidates = ["guitar", "piano", "other"]
    energies = {name: stem_energy(stems[name]) for name in candidates}
    primary = max(candidates, key=lambda name: energies[name])
    print("6-stems instrumento principal:", primary, energies, flush=True)

    pu.encode_or_mix(
        [stems["drums"]],
        target / "round-1.ogg",
    )
    pu.encode_or_mix(
        [stems["drums"], stems["bass"]],
        target / "round-2.ogg",
        gains=[1.0, 1.0],
    )
    pu.encode_or_mix(
        [stems["drums"], stems["bass"], stems[primary]],
        target / "round-3.ogg",
        gains=[1.0, 1.0, 0.95],
    )
    pu.encode_or_mix(
        [
            stems["drums"],
            stems["bass"],
            stems["guitar"],
            stems["piano"],
            stems["other"],
            melody,
        ],
        target / "round-4.ogg",
        gains=[0.82, 0.86, 0.78, 0.72, 0.78, 1.15],
    )
    pu.encode_or_mix(
        [original_clip],
        target / "round-5.ogg",
    )

    if melody.exists():
        melody.unlink()

    return primary, energies


def method_manifest(method_id, name, description, extra=None):
    data = {
        "id": method_id,
        "name": name,
        "description": description,
        "rounds": [
            f"separation-tests/lab/{method_id}/round-{i}.ogg"
            for i in range(1, 6)
        ],
    }
    if extra:
        data.update(extra)
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--artist", default="")
    parser.add_argument("--clip-start", default="")
    args = parser.parse_args()

    source = Path(args.file).resolve()
    if not source.exists() or not source.is_file():
        raise SystemExit(f"Arquivo não encontrado: {source}")

    title, artist = pu.infer_metadata(source, args.title, args.artist)
    print(f"Laboratório: {artist} — {title}", flush=True)

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mdd-separation-lab-") as tmp:
        work = Path(tmp)

        if args.clip_start.strip():
            try:
                start = max(0.0, float(args.clip_start.strip().replace(",", ".")))
            except ValueError:
                raise SystemExit("--clip-start precisa ser um número em segundos")
        else:
            start = pu.choose_clip_start(source, work / "selection")

        duration = audio_duration(source)
        if duration > 0:
            start = min(start, max(0.0, duration - CLIP_SECONDS))

        print(f"Trecho comparado: {start:.1f}s → {start + CLIP_SECONDS:.1f}s", flush=True)

        # Trecho original de 18s usado igualmente nas três versões.
        original_clip = extract_window(
            source,
            start,
            CLIP_SECONDS,
            work / "original-clip.wav",
        )

        # ------------------------------------------------------------------
        # MÉTODO 1 — pipeline atual do jogo, sem nenhuma alteração.
        # ------------------------------------------------------------------
        current_work = work / "current"
        current_work.mkdir(parents=True, exist_ok=True)
        current_clip = extract_window(
            source,
            start,
            CLIP_SECONDS,
            current_work / "clip.wav",
        )
        current_stems = pu.separate_stems(current_clip, current_work)
        current_karaoke = pu.separate_vocal_instrumental(current_clip, current_work)
        pu.build_rounds(
            current_clip,
            current_stems,
            current_karaoke,
            OUTPUT_DIR / "current",
        )

        # ------------------------------------------------------------------
        # Contexto: 9s antes + 18s do jogo + 9s depois sempre que possível.
        # Os modelos recebem mais informação, e só depois recortamos os 18s.
        # ------------------------------------------------------------------
        context_start = max(0.0, start - CONTEXT_PADDING)
        context_end = start + CLIP_SECONDS + CONTEXT_PADDING
        if duration > 0:
            context_end = min(duration, context_end)
        context_duration = max(CLIP_SECONDS, context_end - context_start)
        context_offset = max(0.0, start - context_start)

        context_clip = extract_window(
            source,
            context_start,
            context_duration,
            work / "context.wav",
        )

        # ------------------------------------------------------------------
        # MÉTODO 2 — Demucs 6 stems com contexto.
        # ------------------------------------------------------------------
        six_raw = separate_demucs_model(
            context_clip,
            work / "six",
            "htdemucs_6s",
            ("drums", "bass", "vocals", "other", "guitar", "piano"),
        )
        six = crop_stems(
            six_raw,
            context_offset,
            work / "six",
            "six",
        )
        primary, energies = build_six_stem_rounds(
            original_clip,
            six,
            OUTPUT_DIR / "six",
        )

        # ------------------------------------------------------------------
        # MÉTODO 3 — o mesmo pipeline forte atual, mas separando com contexto.
        # ------------------------------------------------------------------
        context_work = work / "context-advanced"
        context_work.mkdir(parents=True, exist_ok=True)
        ctx_stems_raw = pu.separate_stems(context_clip, context_work)
        ctx_karaoke_raw = pu.separate_vocal_instrumental(context_clip, context_work)

        ctx_stems = crop_stems(
            ctx_stems_raw,
            context_offset,
            context_work,
            "demucs-ft",
        )
        ctx_karaoke = crop_stems(
            ctx_karaoke_raw,
            context_offset,
            context_work,
            "roformer",
        )
        pu.build_rounds(
            original_clip,
            ctx_stems,
            ctx_karaoke,
            OUTPUT_DIR / "context",
        )

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "title": title,
        "artist": artist,
        "sourceName": source.name,
        "clipStart": round(float(start), 2),
        "clipSeconds": CLIP_SECONDS,
        "contextSeconds": round(float(context_duration), 2),
        "methods": [
            method_manifest(
                "current",
                "Atual",
                "Pipeline usado hoje no jogo: corta 18s primeiro e depois separa.",
            ),
            method_manifest(
                "six",
                "6 stems",
                "Separa com contexto em bateria, baixo, guitarra, piano, outros e voz. A 3ª rodada adiciona o instrumento dominante.",
                {
                    "primaryInstrument": primary,
                    "stemEnergy": {k: round(float(v), 6) for k, v in energies.items()},
                },
            ),
            method_manifest(
                "context",
                "Contexto avançado",
                "Demucs FT + BS-Roformer recebem um trecho maior e os 18s são recortados só depois da separação.",
            ),
        ],
    }

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
