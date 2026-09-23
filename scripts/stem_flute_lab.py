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

import librosa
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d, median_filter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "stem-flute-lab"
CLIP_SECONDS = 18.0
TARGET_SR = 44100


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def safe_name(path):
    return Path(path).name


def minmax(values):
    arr = np.asarray(values, dtype=np.float64)
    if arr.size == 0:
        return arr
    lo = float(np.min(arr))
    hi = float(np.max(arr))
    if hi - lo < 1e-9:
        return np.ones_like(arr) * 0.5
    return (arr - lo) / (hi - lo)


def choose_clip_start(source, work):
    """Escolhe 18s fortes/recognosciveis sem depender dos stems."""
    analysis = work / "analysis.wav"
    run([
        "ffmpeg", "-y", "-v", "error",
        "-i", source,
        "-vn", "-ac", "1", "-ar", "11025",
        "-c:a", "pcm_s16le",
        analysis,
    ])

    y, sr = sf.read(analysis, dtype="float32")
    if y.ndim > 1:
        y = np.mean(y, axis=1)

    duration = len(y) / float(sr or 1)
    if duration <= CLIP_SECONDS + 1.0:
        return 0.0, {"duration": duration, "candidates": 1, "score": 1.0}

    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop)[0]
    frame_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    aligned = min(len(rms), len(onset), len(centroid), len(frame_times))
    rms = rms[:aligned]
    onset = onset[:aligned]
    centroid = centroid[:aligned]
    frame_times = frame_times[:aligned]

    min_start = max(8.0, duration * 0.12)
    max_start = min(duration - CLIP_SECONDS - 4.0, duration * 0.72)
    if max_start <= min_start:
        min_start = 0.0
        max_start = max(0.0, duration - CLIP_SECONDS)

    starts = np.arange(math.floor(min_start), math.floor(max_start) + 0.01, 1.0)
    if starts.size == 0:
        starts = np.asarray([max(0.0, (duration - CLIP_SECONDS) / 2.0)])

    loudness = []
    activity = []
    brightness = []
    center_pref = []

    for start in starts:
        end = start + CLIP_SECONDS
        mask = (frame_times >= start) & (frame_times < end)
        if not np.any(mask):
            loudness.append(0.0)
            activity.append(0.0)
            brightness.append(0.0)
        else:
            rv = rms[mask]
            ov = onset[mask]
            cv = centroid[mask]
            loudness.append(float(np.mean(rv)))
            activity.append(float(np.mean(ov) + 0.35 * np.std(ov)))
            brightness.append(float(np.mean(cv)))
        mid = start + CLIP_SECONDS / 2.0
        preferred = duration * 0.48
        width = max(duration * 0.28, 1.0)
        center_pref.append(math.exp(-abs(mid - preferred) / width))

    l = minmax(loudness)
    a = minmax(activity)
    b = minmax(brightness)
    c = np.asarray(center_pref)

    # Volume e atividade rítmica dominam; o viés de centro evita intro/outro.
    # Brilho tem peso pequeno para evitar escolher trechos muito vazios.
    score = 0.50 * l + 0.27 * a + 0.08 * b + 0.15 * c
    best_idx = int(np.argmax(score))
    best = float(starts[best_idx])

    # Mantém uma margem limpa para o encoder.
    best = max(0.0, min(best, max(0.0, duration - CLIP_SECONDS)))
    return best, {
        "duration": round(duration, 3),
        "candidates": int(len(starts)),
        "score": round(float(score[best_idx]), 4),
    }


def extract_clip(source, start, work):
    clip = work / "clip.wav"
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{start:.3f}",
        "-t", f"{CLIP_SECONDS:.3f}",
        "-i", source,
        "-vn", "-ac", "2", "-ar", str(TARGET_SR),
        "-c:a", "pcm_s16le",
        clip,
    ])
    return clip


def separate_stems(clip, work):
    out = work / "separated"
    run([
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs_6s",
        "--device", "cpu",
        "--shifts", "1",
        "--overlap", "0.25",
        "--out", out,
        clip,
    ])

    stem_dir = out / "htdemucs_6s" / clip.stem
    names = ("drums", "bass", "vocals", "guitar", "piano", "other")
    stems = {name: stem_dir / f"{name}.wav" for name in names}
    missing = [name for name, path in stems.items() if not path.exists()]
    if missing:
        raise RuntimeError("Demucs 6 stems não gerou: " + ", ".join(missing))
    return stems


def _fix_octaves(midi_curve, valid):
    fixed = midi_curve.copy()
    idx = np.flatnonzero(valid)
    if idx.size < 3:
        return fixed

    # Referência local robusta. Corrige erros típicos de oitava sem quantizar
    # a afinação, então vibrato e slides continuam existindo.
    filled = fixed.copy()
    good = np.isfinite(filled)
    x = np.arange(len(filled))
    filled[~good] = np.interp(x[~good], x[good], filled[good])
    local = median_filter(filled, size=9, mode="nearest")

    for i in idx:
        value = fixed[i]
        ref = local[i]
        while value - ref > 7.0:
            value -= 12.0
        while ref - value > 7.0:
            value += 12.0
        fixed[i] = value
    return fixed


def synthesize_flute(vocal_path, out_path):
    """Transforma o contorno contínuo da voz em flauta. Não cria MIDI."""
    y, sr = librosa.load(vocal_path, sr=TARGET_SR, mono=True)
    target_len = int(round(CLIP_SECONDS * sr))
    if len(y) < target_len:
        y = np.pad(y, (0, target_len - len(y)))
    else:
        y = y[:target_len]

    hop = 256
    frame_length = 2048
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=65.0,
        fmax=1100.0,
        sr=sr,
        frame_length=frame_length,
        hop_length=hop,
        center=True,
    )

    if f0 is None or len(f0) == 0:
        sf.write(out_path, np.zeros((target_len, 2), dtype=np.float32), sr, subtype="PCM_16")
        return {"voicedPercent": 0.0, "medianHz": 0.0}

    voiced_prob = np.asarray(voiced_prob if voiced_prob is not None else np.zeros_like(f0), dtype=np.float64)
    voiced_flag = np.asarray(voiced_flag if voiced_flag is not None else np.isfinite(f0), dtype=bool)
    valid = voiced_flag & np.isfinite(f0) & (voiced_prob >= 0.50)

    # Limpa ilhas de 1-2 frames sem apagar vibrato.
    gate_frames = valid.astype(np.float64)
    gate_frames = gaussian_filter1d(gate_frames, sigma=1.15)
    valid = gate_frames >= 0.36

    midi_curve = np.full(len(f0), np.nan, dtype=np.float64)
    finite_f0 = np.isfinite(f0) & (f0 > 0)
    midi_curve[finite_f0] = 69.0 + 12.0 * np.log2(f0[finite_f0] / 440.0)
    midi_curve = _fix_octaves(midi_curve, valid & np.isfinite(midi_curve))

    good = valid & np.isfinite(midi_curve)
    if np.count_nonzero(good) < 3:
        sf.write(out_path, np.zeros((target_len, 2), dtype=np.float32), sr, subtype="PCM_16")
        return {"voicedPercent": 0.0, "medianHz": 0.0}

    frame_x = np.arange(len(midi_curve), dtype=np.float64)
    interp_midi = np.interp(frame_x, frame_x[good], midi_curve[good])
    # Suavização mínima: tira jitter digital, preservando slides e vibrato.
    interp_midi = gaussian_filter1d(interp_midi, sigma=0.75)
    interp_hz = 440.0 * np.power(2.0, (interp_midi - 69.0) / 12.0)

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop, center=True)[0]
    if len(rms) < len(f0):
        rms = np.pad(rms, (0, len(f0) - len(rms)), mode="edge")
    rms = rms[: len(f0)]
    if float(np.max(rms)) > 1e-8:
        rms = rms / float(np.max(rms))
    amp_frames = np.power(np.clip(rms, 0.0, 1.0), 0.62) * gate_frames
    amp_frames = gaussian_filter1d(amp_frames, sigma=1.2)

    frame_times = np.arange(len(f0), dtype=np.float64) * hop / sr
    sample_times = np.arange(target_len, dtype=np.float64) / sr
    freq = np.interp(sample_times, frame_times, interp_hz, left=interp_hz[0], right=interp_hz[-1])
    amp = np.interp(sample_times, frame_times, amp_frames, left=0.0, right=0.0)

    # Fase contínua = nada de notas picotadas/8-bit.
    phase = 2.0 * np.pi * np.cumsum(freq) / sr

    # Timbre de flauta por síntese aditiva, mantendo pitch contínuo da cantora.
    tone = (
        1.00 * np.sin(phase)
        + 0.16 * np.sin(2.0 * phase + 0.17)
        + 0.055 * np.sin(3.0 * phase + 0.31)
        + 0.018 * np.sin(4.0 * phase + 0.53)
    )

    # Leve sopro determinístico para fugir de um seno "MIDI".
    rng = np.random.default_rng(20260923)
    breath = rng.standard_normal(target_len)
    breath = gaussian_filter1d(breath, sigma=2.0)
    breath /= max(float(np.max(np.abs(breath))), 1e-9)

    mono = (tone + 0.018 * breath) * amp

    # Ambiência curta e discreta.
    d1 = int(0.027 * sr)
    d2 = int(0.043 * sr)
    left = mono.copy()
    right = mono.copy()
    if d1 < target_len:
        left[d1:] += mono[:-d1] * 0.10
    if d2 < target_len:
        right[d2:] += mono[:-d2] * 0.085

    stereo = np.column_stack([left, right])
    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    if peak > 1e-8:
        stereo = stereo * (0.86 / peak)

    sf.write(out_path, stereo.astype(np.float32), sr, subtype="PCM_16")
    median_hz = float(np.median(f0[good])) if np.any(good) else 0.0
    return {
        "voicedPercent": round(float(np.mean(good) * 100.0), 1),
        "medianHz": round(median_hz, 2),
    }


def encode_ogg(source, target):
    run([
        "ffmpeg", "-y", "-v", "error",
        "-i", source,
        "-c:a", "libvorbis", "-q:a", "5",
        target,
    ])


def read_stereo(path):
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != TARGET_SR:
        channels = []
        for ch in range(audio.shape[1]):
            channels.append(librosa.resample(audio[:, ch], orig_sr=sr, target_sr=TARGET_SR))
        n = min(len(ch) for ch in channels)
        audio = np.column_stack([ch[:n] for ch in channels])
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    return audio


def build_mix(stems, flute_path, out_path):
    parts = []
    for name in ("drums", "bass", "guitar", "piano", "other"):
        parts.append(read_stereo(stems[name]))
    parts.append(read_stereo(flute_path))

    n = min(len(x) for x in parts)
    mix = np.zeros((n, 2), dtype=np.float32)
    for part in parts:
        mix += part[:n]

    # Um pouco de headroom; o objetivo é teste, não masterização.
    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > 1e-8:
        mix *= min(1.0, 0.91 / peak)
    sf.write(out_path, mix, TARGET_SR, subtype="PCM_16")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    source = Path(args.file)
    if not source.exists():
        raise FileNotFoundError(source)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # O laboratório é descartável: sempre substitui só os próprios resultados.
    for p in OUT_DIR.iterdir():
        if p.is_file():
            p.unlink()
        elif p.is_dir():
            shutil.rmtree(p)

    with tempfile.TemporaryDirectory(prefix="mdd-stem-flute-") as td:
        work = Path(td)
        clip_start, choice = choose_clip_start(source, work)
        print(f"Trecho escolhido: {clip_start:.2f}s", flush=True)
        clip = extract_clip(source, clip_start, work)
        stems = separate_stems(clip, work)

        flute_wav = work / "melody-flute.wav"
        flute_stats = synthesize_flute(stems["vocals"], flute_wav)

        mix_wav = work / "instrumental-with-flute.wav"
        build_mix(stems, flute_wav, mix_wav)

        outputs = {
            "preview": mix_wav,
            "flute": flute_wav,
            "drums": stems["drums"],
            "bass": stems["bass"],
            "guitar": stems["guitar"],
            "piano": stems["piano"],
            "other": stems["other"],
            "vocals": stems["vocals"],
            "original": clip,
        }

        labels = {
            "preview": "Mix sem voz + flauta",
            "flute": "Melodia em flauta",
            "drums": "Bateria",
            "bass": "Baixo",
            "guitar": "Guitarra / violão",
            "piano": "Piano / teclas",
            "other": "Outros instrumentos",
            "vocals": "Voz isolada (comparação)",
            "original": "Trecho original",
        }

        tracks = []
        for key, source_path in outputs.items():
            filename = f"{key}.ogg"
            target = OUT_DIR / filename
            encode_ogg(source_path, target)
            tracks.append({
                "id": key,
                "label": labels[key],
                "url": f"/stem-flute-lab/{filename}",
            })

        manifest = {
            "version": 1,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceName": safe_name(source),
            "sourcePath": str(source).replace("\\", "/"),
            "clipStart": round(float(clip_start), 3),
            "clipSeconds": CLIP_SECONDS,
            "selection": choice,
            "separationModel": "htdemucs_6s",
            "voiceTransform": "continuous-pitch flute (pYIN, no MIDI)",
            "flute": flute_stats,
            "tracks": tracks,
        }
        (OUT_DIR / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print("Stem + Flauta Lab pronto.", flush=True)


if __name__ == "__main__":
    main()
