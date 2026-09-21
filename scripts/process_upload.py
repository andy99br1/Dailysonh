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
    """Transforma o vocal isolado em notas estáveis, sem preservar a voz/letra."""
    y, sr = librosa.load(vocal_path, sr=22050, mono=True)
    if len(y) == 0:
        sf.write(out_path, np.zeros((1, 2), dtype=np.float32), sr)
        return

    # Reduz resíduos de bateria/instrumentos que vazaram para o stem vocal.
    y = librosa.effects.harmonic(y, margin=5.0)

    hop = 256
    frame_length = 2048
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        sr=sr,
        frame_length=frame_length,
        hop_length=hop,
    )
    rms = librosa.feature.rms(
        y=y,
        frame_length=frame_length,
        hop_length=hop,
    )[0]

    if f0 is None or len(f0) == 0:
        sf.write(out_path, np.zeros((len(y), 2), dtype=np.float32), sr)
        return

    n = len(f0)
    if voiced_prob is None:
        voiced_prob = np.ones(n, dtype=np.float32)
    if voiced_flag is None:
        voiced_flag = np.isfinite(f0)

    rms = np.pad(rms, (0, max(0, n - len(rms))), mode="edge")[:n]
    rms_floor = max(float(np.percentile(rms, 18)), 1e-5)

    midi = np.full(n, np.nan, dtype=np.float64)
    valid = (
        np.isfinite(f0)
        & np.asarray(voiced_flag, dtype=bool)
        & (np.asarray(voiced_prob) >= 0.58)
        & (rms >= rms_floor)
    )
    midi[valid] = librosa.hz_to_midi(f0[valid])

    if not np.any(np.isfinite(midi)):
        sf.write(out_path, np.zeros((len(y), 2), dtype=np.float32), sr)
        return

    # Interpola apenas para suavização e depois restaura os silêncios.
    idx = np.arange(n)
    good = np.isfinite(midi)
    smooth = np.interp(idx, idx[good], midi[good])
    smooth = median_filter(smooth, size=7, mode="nearest")
    notes = np.round(smooth).astype(np.int16)
    notes[~valid] = -1

    # Une microfalhas de detecção quando a mesma nota continua dos dois lados.
    max_gap = 4
    i = 0
    while i < n:
        if notes[i] != -1:
            i += 1
            continue
        j = i
        while j < n and notes[j] == -1:
            j += 1
        if (
            i > 0 and j < n and
            j - i <= max_gap and
            notes[i - 1] == notes[j]
        ):
            notes[i:j] = notes[i - 1]
        i = j

    # Suprime notas espúrias muito curtas e pequenos saltos de uma única janela.
    min_frames = 5
    segments = []
    i = 0
    while i < n:
        note = int(notes[i])
        j = i + 1
        while j < n and int(notes[j]) == note:
            j += 1
        if note >= 0 and j - i >= min_frames:
            segments.append([i, j, note])
        i = j

    # Mescla fragmentos vizinhos da mesma altura separados por um gap minúsculo.
    merged = []
    for seg in segments:
        if (
            merged and
            seg[2] == merged[-1][2] and
            seg[0] - merged[-1][1] <= 3
        ):
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)

    synth = np.zeros(len(y), dtype=np.float32)
    peak_rms = max(float(np.percentile(rms, 95)), 1e-5)

    for start_frame, end_frame, note in merged:
        start = int(start_frame * hop)
        end = min(len(y), int(end_frame * hop + frame_length // 2))
        if end <= start:
            continue

        freq = float(librosa.midi_to_hz(note))
        length = end - start
        t = np.arange(length, dtype=np.float64) / sr

        # Timbre simples tipo synth/piano eletrônico; não imita o cantor.
        tone = (
            np.sin(2 * math.pi * freq * t)
            + 0.20 * np.sin(2 * math.pi * freq * 2 * t)
            + 0.06 * np.sin(2 * math.pi * freq * 3 * t)
        )

        seg_rms = float(np.median(rms[start_frame:min(end_frame, len(rms))]))
        velocity = np.clip(seg_rms / peak_rms, 0.35, 1.0)
        env = np.ones(length, dtype=np.float64)
        attack = min(int(sr * 0.018), max(1, length // 4))
        release = min(int(sr * 0.045), max(1, length // 3))
        if attack > 1:
            env[:attack] = np.linspace(0.0, 1.0, attack)
        if release > 1:
            env[-release:] *= np.linspace(1.0, 0.0, release)

        synth[start:end] += (tone * env * velocity * 0.32).astype(np.float32)

    max_amp = float(np.max(np.abs(synth))) if len(synth) else 0.0
    if max_amp > 0.92:
        synth *= 0.92 / max_amp

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
