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
        "-n", "htdemucs",
        "--device", "cpu",
        "--out", out,
        clip,
    ])

    stem_dir = out / "htdemucs" / clip.stem
    stems = {
        name: stem_dir / f"{name}.wav"
        for name in ("drums", "bass", "vocals", "other")
    }
    missing = [name for name, path in stems.items() if not path.exists()]
    if missing:
        raise RuntimeError("Demucs não gerou: " + ", ".join(missing))
    return stems


def synthesize_vocal_melody(vocal_path, out_path):
    y, sr = librosa.load(vocal_path, sr=44100, mono=True)
    if len(y) == 0:
        sf.write(out_path, np.zeros((1, 2), dtype=np.float32), sr)
        return

    hop = 512
    f0, voiced_flag, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        sr=sr,
        frame_length=2048,
        hop_length=hop,
    )
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]

    if f0 is None or len(f0) == 0:
        synth = np.zeros(len(y), dtype=np.float32)
    else:
        valid = np.isfinite(f0) & np.asarray(voiced_flag, dtype=bool)
        quantized = np.zeros_like(f0, dtype=np.float64)

        if np.any(valid):
            midi = np.round(librosa.hz_to_midi(f0[valid]))
            quantized[valid] = librosa.midi_to_hz(midi)

        frame_index = np.minimum(np.arange(len(y)) // hop, len(quantized) - 1)
        freq = quantized[frame_index]

        if len(rms) < len(quantized):
            rms = np.pad(rms, (0, len(quantized) - len(rms)), mode="edge")
        env = rms[:len(quantized)][frame_index]
        if np.max(env) > 0:
            env = env / np.max(env)
        env = np.power(np.clip(env, 0, 1), 0.65) * (freq > 0)

        phase = 2.0 * math.pi * np.cumsum(freq) / sr
        synth = (np.sin(phase) + 0.22 * np.sin(2 * phase)) * env * 0.28

        fade = min(int(sr * 0.04), len(synth) // 2)
        if fade > 1:
            ramp = np.linspace(0, 1, fade)
            synth[:fade] *= ramp
            synth[-fade:] *= ramp[::-1]

    stereo = np.column_stack([synth, synth]).astype(np.float32)
    sf.write(out_path, stereo, sr, subtype="PCM_16")


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
        ("round-4.ogg", [stems["drums"], stems["bass"], stems["other"], melody]),
        ("round-5.ogg", [clip]),
    ]

    for filename, inputs in specs:
        encode_or_mix(inputs, target / filename)

    if melody.exists():
        melody.unlink()


def update_catalog(day, title, artist, start, source_name):
    entry = {
        "date": day,
        "title": title,
        "artist": artist,
        "clipStart": round(float(start), 2),
        "source": "upload",
        "sourceName": source_name,
        "rounds": [f"songs/{day}/round-{i}.ogg" for i in range(1, 6)],
    }

    if CATALOG_PATH.exists():
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    else:
        catalog = {"songs": []}

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
