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


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "catalog.json"
SONGS_DIR = ROOT / "songs"
CLIP_SECONDS = 18.0


def run(cmd, cwd=None, capture=False):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    result = subprocess.run(
        [str(x) for x in cmd],
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=None,
    )
    return result.stdout.strip() if capture else ""


def today_brazil():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()


def clean_video_title(raw):
    title = re.sub(
        r"\s*[\(\[][^)\]]*(official|lyrics?|audio|video|visuali[sz]er|4k|hd)[^)\]]*[\)\]]\s*",
        " ",
        raw,
        flags=re.I,
    )
    title = re.sub(r"\s+", " ", title).strip(" -–—|")
    return title or raw.strip()


def infer_metadata(info):
    raw_title = str(info.get("title") or "Música")
    track = info.get("track")
    artist = info.get("artist") or info.get("creator")

    if track:
        title = str(track).strip()
    else:
        cleaned = clean_video_title(raw_title)
        if " - " in cleaned:
            left, right = cleaned.split(" - ", 1)
            if not artist:
                artist = left.strip()
            title = right.strip()
        else:
            title = cleaned

    if not artist:
        artist = info.get("uploader") or "Artista desconhecido"

    return title.strip(), str(artist).strip()


def download_youtube(url, work):
    template = str(work / "source.%(ext)s")
    run([
        "yt-dlp",
        "--no-playlist",
        "--js-runtimes", "deno",
        "--write-info-json",
        "--no-write-comments",
        "--no-write-playlist-metafiles",
        "-f", "bestaudio/best",
        "-o", template,
        url,
    ])

    info_path = work / "source.info.json"
    if not info_path.exists():
        raise RuntimeError("yt-dlp não gerou source.info.json")

    info = json.loads(info_path.read_text(encoding="utf-8"))
    candidates = [
        p for p in work.glob("source.*")
        if p.name != "source.info.json" and not p.name.endswith(".part")
    ]
    if not candidates:
        raise RuntimeError("Nenhum arquivo de áudio foi baixado.")
    source = max(candidates, key=lambda p: p.stat().st_size)
    return source, info


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
    duration = len(y) / sr
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
    kernel = np.ones(window, dtype=np.float32) / window
    rolling = np.convolve(rms, kernel, mode="valid")

    min_start = min(15, max(0, int(duration * 0.10)))
    max_start = int(max(0, duration - CLIP_SECONDS - 5))
    if max_start <= min_start:
        min_start = 0
        max_start = len(rolling) - 1

    lo = max(0, min_start)
    hi = min(len(rolling) - 1, max_start)
    if hi < lo:
        return 0.0

    segment = rolling[lo:hi + 1]
    best = lo + int(np.argmax(segment))
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
        "--out", out,
        clip,
    ])
    stem_dir = out / "htdemucs" / clip.stem
    required = {name: stem_dir / f"{name}.wav" for name in ("drums", "bass", "vocals", "other")}
    missing = [name for name, path in required.items() if not path.exists()]
    if missing:
        raise RuntimeError("Demucs não gerou stems: " + ", ".join(missing))
    return required


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
        env_frames = np.pad(rms, (0, max(0, len(quantized) - len(rms))), mode="edge")[:len(quantized)]
        env = env_frames[frame_index]
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
        filt = f"amix=inputs={len(inputs)}:duration=longest:normalize=0,alimiter=limit=0.95"
        cmd += [
            "-filter_complex", filt,
            "-c:a", "libopus", "-b:a", "96k",
            "-ar", "48000",
            output,
        ]
    run(cmd)


def build_rounds(clip, stems, target):
    target.mkdir(parents=True, exist_ok=True)
    melody = target.parent / "_melody.wav"
    synthesize_vocal_melody(stems["vocals"], melody)

    round_specs = [
        ("round-1.ogg", [stems["drums"]]),
        ("round-2.ogg", [stems["drums"], stems["bass"]]),
        ("round-3.ogg", [stems["drums"], stems["bass"], stems["other"]]),
        ("round-4.ogg", [stems["drums"], stems["bass"], stems["other"], melody]),
        ("round-5.ogg", [clip]),
    ]
    for filename, inputs in round_specs:
        encode_or_mix(inputs, target / filename)
    if melody.exists():
        melody.unlink()


def update_catalog(day, info, start):
    title, artist = infer_metadata(info)
    entry = {
        "date": day,
        "title": title,
        "artist": artist,
        "youtubeId": info.get("id"),
        "youtubeUrl": info.get("webpage_url") or info.get("original_url"),
        "thumbnail": info.get("thumbnail"),
        "clipStart": round(float(start), 2),
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
    parser.add_argument("--url", required=True)
    parser.add_argument("--date", default="")
    args = parser.parse_args()

    day = args.date.strip() or today_brazil()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise SystemExit("--date precisa estar em YYYY-MM-DD")

    target = SONGS_DIR / day
    if target.exists():
        shutil.rmtree(target)

    with tempfile.TemporaryDirectory(prefix="dailysonh-") as tmp:
        work = Path(tmp)
        source, info = download_youtube(args.url, work)
        start = choose_clip_start(source, work)
        print(f"Trecho selecionado: {start:.1f}s → {start + CLIP_SECONDS:.1f}s")
        clip = extract_clip(source, start, work)
        stems = separate_stems(clip, work)
        build_rounds(clip, stems, target)
        entry = update_catalog(day, info, start)

    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
