#!/usr/bin/env python3
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import librosa
import numpy as np
import soundfile as sf
import torch
import torchcrepe
from scipy.ndimage import median_filter
from mutagen import File as MutagenFile


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "catalog.json"
SONGS_DIR = ROOT / "songs"
CLIP_SECONDS = 18.0


def run(cmd):
    printable = " ".join(str(x) for x in cmd)
    print("+", printable, flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def today_brazil():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()


def first_tag(tags, key):
    if not tags:
        return ""
    value = tags.get(key)
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    return str(value).strip()


def infer_metadata(source, title_override="", artist_override=""):
    title = title_override.strip()
    artist = artist_override.strip()

    try:
        audio = MutagenFile(source, easy=True)
        tags = getattr(audio, "tags", None)
        if not title:
            title = first_tag(tags, "title")
        if not artist:
            artist = first_tag(tags, "artist")
    except Exception as exc:
        print(f"Aviso: não consegui ler metadados do arquivo: {exc}", flush=True)

    stem = source.stem.strip()
    if (not title or not artist) and " - " in stem:
        left, right = stem.split(" - ", 1)
        if not artist:
            artist = left.strip()
        if not title:
            title = right.strip()

    if not title:
        title = stem or "Música"
    if not artist:
        artist = "Artista desconhecido"

    return title, artist


def choose_clip_start(source, work):
    analysis_wav = work / "analysis.wav"
    run([
        "ffmpeg", "-y", "-v", "error",
        "-i", source,
        "-vn", "-ac", "1", "-ar", "8000",
        analysis_wav,
    ])

    y, sr = sf.read(analysis_wav, dtype="float32")
    if y.ndim > 1:
        y = np.mean(y, axis=1)

    duration = len(y) / sr if sr else 0
    if duration <= CLIP_SECONDS + 1:
        return 0.0

    rms = librosa.feature.rms(
        y=y,
        frame_length=sr,
        hop_length=sr,
        center=False,
    )[0]

    if len(rms) == 0:
        return max(0.0, (duration - CLIP_SECONDS) / 2)

    window = max(1, int(round(CLIP_SECONDS)))
    rolling = np.convolve(
        rms,
        np.ones(window, dtype=np.float32) / window,
        mode="valid",
    )

    # Evita intro e final quando possível e procura uma região musicalmente ativa.
    min_start = min(20, max(0, int(duration * 0.12)))
    max_start = int(max(0, duration - CLIP_SECONDS - 8))

    if max_start <= min_start:
        min_start = 0
        max_start = len(rolling) - 1

    lo = max(0, min_start)
    hi = min(len(rolling) - 1, max_start)
    if hi < lo:
        return 0.0

    best = lo + int(np.argmax(rolling[lo:hi + 1]))
    return float(best)


def extract_clip(source, start, work):
    clip = work / "clip.wav"
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{start:.3f}",
        "-t", f"{CLIP_SECONDS:.3f}",
        "-i", source,
        "-vn", "-ac", "2", "-ar", "44100",
        "-c:a", "pcm_s16le",
        clip,
    ])
    return clip


def separate_stems(clip, work):
    out = work / "separated"
    run([
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs_ft",
        "--device", "cpu",
        "--out", out,
        clip,
    ])

    stem_dir = out / "htdemucs_ft" / clip.stem
    stems = {
        name: stem_dir / f"{name}.wav"
        for name in ("drums", "bass", "vocals", "other")
    }
    missing = [name for name, path in stems.items() if not path.exists()]
    if missing:
        raise RuntimeError("Demucs não gerou: " + ", ".join(missing))
    return stems


def synthesize_vocal_melody(vocal_path, out_path):
    """Extrai a linha melódica principal com CREPE e a ressintetiza sem voz/letra."""
    # CREPE foi treinado para pitch monofônico e lida melhor com vibrato e
    # mudanças rápidas do que a estimativa espectral anterior.
    sr = 16000
    y, _ = librosa.load(vocal_path, sr=sr, mono=True)
    if len(y) == 0:
        sf.write(out_path, np.zeros((1, 2), dtype=np.float32), sr)
        return

    # Mantém o waveform natural para o modelo e apenas normaliza picos.
    peak = float(np.max(np.abs(y))) if len(y) else 0.0
    if peak > 1e-6:
        y = y / max(1.0, peak / 0.95)

    hop = 160  # 10 ms
    audio_tensor = torch.from_numpy(y.astype(np.float32)).unsqueeze(0)

    with torch.no_grad():
        pitch_t, periodicity_t = torchcrepe.predict(
            audio_tensor,
            sr,
            hop,
            65.0,
            1100.0,
            model="full",
            batch_size=1024,
            device="cpu",
            return_periodicity=True,
        )

    pitch = pitch_t.squeeze(0).cpu().numpy().astype(np.float64)
    periodicity = periodicity_t.squeeze(0).cpu().numpy().astype(np.float64)

    if len(pitch) == 0:
        sf.write(out_path, np.zeros((len(y), 2), dtype=np.float32), sr)
        return

    # Suaviza confiança e pitch. O Viterbi do TorchCrepe já reduz erros de
    # meia/dobra de frequência; esta etapa remove jitter residual.
    periodicity = median_filter(periodicity, size=5, mode="nearest")
    log_pitch = np.log2(np.maximum(pitch, 1.0))
    log_pitch = median_filter(log_pitch, size=5, mode="nearest")
    pitch = np.power(2.0, log_pitch)

    rms = librosa.feature.rms(
        y=y,
        frame_length=1024,
        hop_length=hop,
        center=True,
    )[0]
    if len(rms) < len(pitch):
        rms = np.pad(rms, (0, len(pitch) - len(rms)), mode="edge")
    rms = rms[:len(pitch)]

    # Thresholds conservadores: é melhor perder um pedaço duvidoso da frase
    # do que tocar notas erradas causadas por backing vocal ou vazamento.
    rms_gate = max(float(np.percentile(rms, 24)), 1e-5)
    valid = (
        np.isfinite(pitch)
        & (pitch >= 65.0)
        & (pitch <= 1100.0)
        & (periodicity >= 0.60)
        & (rms >= rms_gate)
    )

    midi = np.full(len(pitch), -1, dtype=np.int16)
    if np.any(valid):
        raw_midi = librosa.hz_to_midi(pitch[valid])
        midi[valid] = np.round(raw_midi).astype(np.int16)

    # Remove notas isoladas de 10–30 ms e estabiliza pequenas oscilações.
    stable = midi.copy()
    i = 0
    while i < len(stable):
        note = int(stable[i])
        j = i + 1
        while j < len(stable) and int(stable[j]) == note:
            j += 1
        if note >= 0 and (j - i) < 5:
            stable[i:j] = -1
        i = j

    # Fecha gaps curtíssimos quando a mesma nota existe antes/depois.
    i = 0
    while i < len(stable):
        if stable[i] >= 0:
            i += 1
            continue
        j = i + 1
        while j < len(stable) and stable[j] < 0:
            j += 1
        if (
            i > 0
            and j < len(stable)
            and (j - i) <= 4
            and stable[i - 1] == stable[j]
        ):
            stable[i:j] = stable[i - 1]
        i = j

    # Corrige "blips" de uma nota entre duas notas iguais.
    if len(stable) >= 3:
        for i in range(1, len(stable) - 1):
            if stable[i - 1] >= 0 and stable[i + 1] == stable[i - 1]:
                if stable[i] < 0 or abs(int(stable[i]) - int(stable[i - 1])) >= 2:
                    stable[i] = stable[i - 1]

    # Segmenta em notas reais. Um mínimo de ~60 ms evita o efeito "metralhadora".
    segments = []
    i = 0
    min_frames = 6
    while i < len(stable):
        note = int(stable[i])
        j = i + 1
        while j < len(stable) and int(stable[j]) == note:
            j += 1
        if note >= 0 and (j - i) >= min_frames:
            segments.append([i, j, note])
        i = j

    # Mescla notas idênticas muito próximas.
    merged = []
    for seg in segments:
        if merged and seg[2] == merged[-1][2] and seg[0] - merged[-1][1] <= 5:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)

    synth = np.zeros(len(y), dtype=np.float32)
    peak_rms = max(float(np.percentile(rms, 95)), 1e-5)

    for start_frame, end_frame, note in merged:
        start = int(start_frame * hop)
        end = min(len(y), int(end_frame * hop + 320))
        if end - start < int(sr * 0.05):
            continue

        freq = float(librosa.midi_to_hz(note))
        length = end - start
        t = np.arange(length, dtype=np.float64) / sr

        # Timbre limpo e claramente instrumental, com menos harmônicos para
        # não soar como voz robótica.
        tone = (
            np.sin(2.0 * math.pi * freq * t)
            + 0.12 * np.sin(2.0 * math.pi * freq * 2.0 * t)
        )

        local_rms = rms[start_frame:min(end_frame, len(rms))]
        strength = float(np.median(local_rms)) if len(local_rms) else peak_rms
        velocity = float(np.clip(strength / peak_rms, 0.28, 0.90))

        env = np.ones(length, dtype=np.float64)
        attack = min(int(sr * 0.025), max(1, length // 4))
        release = min(int(sr * 0.055), max(1, length // 3))
        if attack > 1:
            env[:attack] = np.linspace(0.0, 1.0, attack)
        if release > 1:
            env[-release:] *= np.linspace(1.0, 0.0, release)

        synth[start:end] += (tone * env * velocity * 0.30).astype(np.float32)

    max_amp = float(np.max(np.abs(synth))) if len(synth) else 0.0
    if max_amp > 0.88:
        synth *= 0.88 / max_amp

    # Entrega em 44.1 kHz para casar com os stems do Demucs.
    synth_44 = librosa.resample(synth, orig_sr=sr, target_sr=44100)
    stereo = np.column_stack([synth_44, synth_44]).astype(np.float32)
    sf.write(out_path, stereo, 44100, subtype="PCM_16")


def encode_or_mix(inputs, output):
    cmd = ["ffmpeg", "-y", "-v", "error"]
    for item in inputs:
        cmd += ["-i", item]

    if len(inputs) == 1:
        cmd += [
            "-map", "0:a:0",
            "-c:a", "libopus", "-b:a", "96k",
            "-ar", "48000",
            output,
        ]
    else:
        cmd += [
            "-filter_complex",
            f"amix=inputs={len(inputs)}:duration=longest:normalize=0,alimiter=limit=0.95",
            "-c:a", "libopus", "-b:a", "96k",
            "-ar", "48000",
            output,
        ]

    run(cmd)


def build_rounds(clip, stems, target):
    target.mkdir(parents=True, exist_ok=True)
    melody = target.parent / "_melody.wav"
    synthesize_vocal_melody(stems["vocals"], melody)

    specs = [
        ("round-1.ogg", [stems["drums"]]),
        ("round-2.ogg", [stems["drums"], stems["bass"]]),
        ("round-3.ogg", [stems["drums"], stems["bass"], stems["other"]]),
        # A melodia aparece antes da revelação, mas ainda sem todo o arranjo.
        ("round-4.ogg", [stems["drums"], stems["bass"], melody]),
        # Revelação segura: arranjo completo sem o vocal original.
        ("round-5.ogg", [stems["drums"], stems["bass"], stems["other"], melody]),
    ]

    for filename, inputs in specs:
        encode_or_mix(inputs, target / filename)

    if melody.exists():
        melody.unlink()


def update_catalog(day, title, artist, start, source_name):
    if CATALOG_PATH.exists():
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    else:
        catalog = {"songs": []}

    previous = next((item for item in catalog.get("songs", []) if item.get("date") == day), None)
    version = int(previous.get("version", 1)) + 1 if previous else 1

    entry = {
        "date": day,
        "title": title,
        "artist": artist,
        "clipStart": round(float(start), 2),
        "source": "upload",
        "sourceName": source_name,
        "version": version,
        "safeRevealRound": 4,
        "rounds": [f"songs/{day}/round-{i}.ogg" for i in range(1, 6)],
    }

    songs = [s for s in catalog.get("songs", []) if s.get("date") != day]
    songs.append(entry)
    songs.sort(key=lambda s: s.get("date", ""))

    CATALOG_PATH.write_text(
        json.dumps({"songs": songs}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return entry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--date", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--artist", default="")
    args = parser.parse_args()

    source = Path(args.file).resolve()
    if not source.exists() or not source.is_file():
        raise SystemExit(f"Arquivo não encontrado: {source}")

    day = args.date.strip() or today_brazil()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise SystemExit("--date precisa estar em YYYY-MM-DD")

    title, artist = infer_metadata(source, args.title, args.artist)
    print(f"Música: {artist} — {title}", flush=True)

    target = SONGS_DIR / day
    if target.exists():
        shutil.rmtree(target)

    with tempfile.TemporaryDirectory(prefix="dailysonh-") as tmp:
        work = Path(tmp)
        start = choose_clip_start(source, work)
        print(f"Trecho selecionado: {start:.1f}s → {start + CLIP_SECONDS:.1f}s", flush=True)
        clip = extract_clip(source, start, work)
        stems = separate_stems(clip, work)
        build_rounds(clip, stems, target)

    entry = update_catalog(day, title, artist, start, source.name)
    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
