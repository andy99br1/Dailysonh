#!/usr/bin/env python3
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
try:
    import torch
    import torchcrepe
except Exception:
    torch = None
    torchcrepe = None
from scipy.ndimage import gaussian_filter1d, median_filter
from scipy.signal import butter, sosfiltfilt


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


def _find_named_wav(folder, wanted):
    direct = folder / f"{wanted}.wav"
    if direct.exists():
        return direct

    wanted_lower = wanted.lower()
    candidates = sorted(folder.glob("*.wav"))
    for path in candidates:
        name = path.stem.lower()
        if wanted_lower in name:
            return path
    return None


def separate_stems(clip, work):
    """
    Híbrido focado em qualidade:
    - Demucs FT fica só com bateria/baixo, que já funcionavam bem no jogo.
    - BS-RoFormer-SW fornece voz, guitarra, piano e other.
    """
    demucs_out = work / "demucs"
    run([
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs_ft",
        "--device", "cpu",
        "--shifts", "1",
        "--overlap", "0.25",
        "--out", demucs_out,
        clip,
    ])

    demucs_dir = demucs_out / "htdemucs_ft" / clip.stem
    demucs_drums = demucs_dir / "drums.wav"
    demucs_bass = demucs_dir / "bass.wav"
    if not demucs_drums.exists() or not demucs_bass.exists():
        raise RuntimeError("Demucs FT não gerou bateria/baixo.")

    roformer_out = work / "roformer6"
    roformer_out.mkdir(parents=True, exist_ok=True)

    separator_bin = Path(
        os.environ.get(
            "AUDIO_SEPARATOR_BIN",
            str(Path(sys.executable).with_name("audio-separator")),
        )
    )
    if not separator_bin.exists():
        raise RuntimeError(f"audio-separator não encontrado: {separator_bin}")

    model_dir = Path.home() / ".cache" / "audio-separator-models"
    model_dir.mkdir(parents=True, exist_ok=True)

    output_names = json.dumps({
        "Vocals": "vocals",
        "Drums": "drums_roformer",
        "Bass": "bass_roformer",
        "Guitar": "guitar",
        "Piano": "piano",
        "Other": "other",
    })

    run([
        separator_bin,
        clip,
        "--model_filename", "BS-Roformer-SW.ckpt",
        "--output_format", "WAV",
        "--output_dir", roformer_out,
        "--model_file_dir", model_dir,
        "--normalization", "0.9",
        "--mdxc_overlap", "8",
        "--custom_output_names", output_names,
    ])

    vocals = _find_named_wav(roformer_out, "vocals")
    guitar = _find_named_wav(roformer_out, "guitar")
    piano = _find_named_wav(roformer_out, "piano")
    other = _find_named_wav(roformer_out, "other")

    missing = [
        name for name, path in (
            ("vocals", vocals),
            ("guitar", guitar),
            ("piano", piano),
            ("other", other),
        )
        if path is None or not path.exists()
    ]
    if missing:
        found = ", ".join(p.name for p in roformer_out.glob("*.wav"))
        raise RuntimeError(
            "BS-RoFormer-SW não gerou os stems esperados: "
            + ", ".join(missing)
            + ". Arquivos encontrados: "
            + found
        )

    return {
        "drums": demucs_drums,
        "bass": demucs_bass,
        "vocals": vocals,
        "guitar": guitar,
        "piano": piano,
        "other": other,
    }

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


def _fill_short_note_gaps(notes, max_gap):
    notes = notes.copy()
    i = 0
    while i < len(notes):
        if notes[i] >= 0:
            i += 1
            continue

        j = i + 1
        while j < len(notes) and notes[j] < 0:
            j += 1

        gap = j - i
        left = int(notes[i - 1]) if i > 0 else -1
        right = int(notes[j]) if j < len(notes) else -1

        if gap <= max_gap and left >= 0 and right >= 0 and abs(left - right) <= 3:
            if left == right:
                notes[i:j] = left
            else:
                bridge = np.rint(np.linspace(left, right, gap + 2)[1:-1]).astype(np.int16)
                notes[i:j] = bridge

        i = j
    return notes


def _clean_short_note_runs(notes, min_frames):
    notes = notes.copy()

    for _ in range(3):
        runs = []
        i = 0
        while i < len(notes):
            value = int(notes[i])
            j = i + 1
            while j < len(notes) and int(notes[j]) == value:
                j += 1
            runs.append((i, j, value))
            i = j

        changed = False
        for idx, (start, end, value) in enumerate(runs):
            if value < 0 or end - start >= min_frames:
                continue

            left = runs[idx - 1][2] if idx > 0 else -1
            right = runs[idx + 1][2] if idx + 1 < len(runs) else -1
            replacement = -1

            if left >= 0 and right >= 0:
                if left == right:
                    replacement = left
                elif abs(value - left) <= abs(value - right):
                    replacement = left
                else:
                    replacement = right
            elif left >= 0:
                replacement = left
            elif right >= 0:
                replacement = right

            notes[start:end] = replacement
            changed = True

        if not changed:
            break

    return notes


def _count_note_segments(notes):
    count = 0
    previous = -1
    for value in notes:
        value = int(value)
        if value >= 0 and value != previous:
            count += 1
        previous = value
    return count


def _fit_frame_array(values, length, fill=np.nan):
    arr = np.asarray(values, dtype=np.float64).reshape(-1)
    if len(arr) >= length:
        return arr[:length]
    out = np.full(length, fill, dtype=np.float64)
    out[:len(arr)] = arr
    return out


def _estimate_crepe(y, sr, hop):
    if torch is None or torchcrepe is None:
        return None, None

    try:
        audio = torch.tensor(np.asarray(y, dtype=np.float32))[None]
        with torch.no_grad():
            pitch, periodicity = torchcrepe.predict(
                audio,
                sr,
                hop,
                65.0,
                1100.0,
                "full",
                batch_size=512,
                device="cpu",
                return_periodicity=True,
            )
            periodicity = torchcrepe.filter.median(periodicity, 3)
            pitch = torchcrepe.filter.mean(pitch, 3)

        return (
            pitch.detach().cpu().numpy().reshape(-1).astype(np.float64),
            periodicity.detach().cpu().numpy().reshape(-1).astype(np.float64),
        )
    except Exception as exc:
        print(f"Aviso: TorchCrepe falhou; usando pYIN como fallback: {exc}", flush=True)
        return None, None


def synthesize_flute(vocal_path, out_path):
    """
    Converte a voz isolada em flauta usando rastreamento neural de pitch
    (TorchCrepe) com pYIN como verificação/fallback. A melodia final mantém
    continuidade e pequenas nuances, mas remove erros de oitava e notas espúrias.
    """
    y, sr = librosa.load(vocal_path, sr=TARGET_SR, mono=True)
    target_len = int(round(CLIP_SECONDS * sr))
    if len(y) < target_len:
        y = np.pad(y, (0, target_len - len(y)))
    else:
        y = y[:target_len]

    hop = 256
    frame_length = 2048

    pyin_f0, pyin_voiced, pyin_prob = librosa.pyin(
        y,
        fmin=65.0,
        fmax=1100.0,
        sr=sr,
        frame_length=frame_length,
        hop_length=hop,
        center=True,
    )

    crepe_f0, crepe_periodicity = _estimate_crepe(y, sr, hop)

    frame_count = max(
        len(pyin_f0) if pyin_f0 is not None else 0,
        len(crepe_f0) if crepe_f0 is not None else 0,
        1,
    )

    pyin_f0 = _fit_frame_array(
        pyin_f0 if pyin_f0 is not None else [],
        frame_count,
    )
    pyin_prob = _fit_frame_array(
        pyin_prob if pyin_prob is not None else [],
        frame_count,
        fill=0.0,
    )
    pyin_voiced = _fit_frame_array(
        np.asarray(pyin_voiced, dtype=np.float64) if pyin_voiced is not None else [],
        frame_count,
        fill=0.0,
    ) > 0.5

    if crepe_f0 is None:
        crepe_f0 = np.full(frame_count, np.nan, dtype=np.float64)
        crepe_periodicity = np.zeros(frame_count, dtype=np.float64)
    else:
        crepe_f0 = _fit_frame_array(crepe_f0, frame_count)
        crepe_periodicity = _fit_frame_array(crepe_periodicity, frame_count, fill=0.0)

    rms = librosa.feature.rms(
        y=y,
        frame_length=frame_length,
        hop_length=hop,
        center=True,
    )[0]
    rms = _fit_frame_array(rms, frame_count, fill=0.0)
    rms_peak = max(float(np.max(rms)), 1e-9)
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-9) / rms_peak)
    energy_good = rms_db > -44.0

    pyin_good = (
        pyin_voiced
        & np.isfinite(pyin_f0)
        & (pyin_f0 > 0)
        & (pyin_prob >= 0.24)
        & energy_good
    )
    crepe_good = (
        np.isfinite(crepe_f0)
        & (crepe_f0 > 0)
        & (crepe_periodicity >= 0.14)
        & energy_good
    )

    pyin_midi = np.full(frame_count, np.nan, dtype=np.float64)
    crepe_midi = np.full(frame_count, np.nan, dtype=np.float64)

    good = np.isfinite(pyin_f0) & (pyin_f0 > 0)
    pyin_midi[good] = 69.0 + 12.0 * np.log2(pyin_f0[good] / 440.0)

    good = np.isfinite(crepe_f0) & (crepe_f0 > 0)
    crepe_midi[good] = 69.0 + 12.0 * np.log2(crepe_f0[good] / 440.0)

    combined = np.full(frame_count, np.nan, dtype=np.float64)
    confidence = np.zeros(frame_count, dtype=np.float64)

    for i in range(frame_count):
        c_ok = bool(crepe_good[i])
        p_ok = bool(pyin_good[i])

        if c_ok and p_ok:
            c = float(crepe_midi[i])
            p = float(pyin_midi[i])

            # Ajusta discrepâncias clássicas de oitava antes de combinar.
            while p - c > 6.0:
                p -= 12.0
            while c - p > 6.0:
                p += 12.0

            diff = abs(c - p)
            if diff <= 1.6:
                cw = max(0.15, float(crepe_periodicity[i]))
                pw = max(0.12, float(pyin_prob[i]) * 0.72)
                combined[i] = (c * cw + p * pw) / (cw + pw)
                confidence[i] = min(1.0, max(cw, pw))
            elif crepe_periodicity[i] >= 0.25:
                combined[i] = c
                confidence[i] = float(crepe_periodicity[i])
            elif pyin_prob[i] >= 0.50:
                combined[i] = p
                confidence[i] = float(pyin_prob[i]) * 0.75
        elif c_ok:
            combined[i] = crepe_midi[i]
            confidence[i] = float(crepe_periodicity[i])
        elif p_ok:
            combined[i] = pyin_midi[i]
            confidence[i] = float(pyin_prob[i]) * 0.75

    raw_valid = np.isfinite(combined)
    if np.count_nonzero(raw_valid) < 3:
        sf.write(out_path, np.zeros((target_len, 2), dtype=np.float32), sr, subtype="PCM_16")
        return {
            "voicedPercent": 0.0,
            "medianHz": 0.0,
            "noteSegments": 0,
            "tracker": "TorchCrepe + pYIN",
            "crepeVoicedPercent": 0.0,
            "pyinVoicedPercent": 0.0,
        }

    combined = _fix_octaves(combined, raw_valid)

    # Remove saltos isolados grandes quando a confiança está baixa.
    x = np.arange(frame_count, dtype=np.float64)
    filled = np.interp(x, x[raw_valid], combined[raw_valid])
    local = median_filter(filled, size=9, mode="nearest")
    suspicious = raw_valid & (np.abs(combined - local) > 5.5) & (confidence < 0.28)
    combined[suspicious] = np.nan
    raw_valid = np.isfinite(combined)

    if np.count_nonzero(raw_valid) < 3:
        sf.write(out_path, np.zeros((target_len, 2), dtype=np.float32), sr, subtype="PCM_16")
        return {
            "voicedPercent": 0.0,
            "medianHz": 0.0,
            "noteSegments": 0,
            "tracker": "TorchCrepe + pYIN",
            "crepeVoicedPercent": round(float(np.mean(crepe_good) * 100.0), 1),
            "pyinVoicedPercent": round(float(np.mean(pyin_good) * 100.0), 1),
        }

    x = np.arange(frame_count, dtype=np.float64)
    filled = np.interp(x, x[raw_valid], combined[raw_valid])

    # Menos quantização agressiva: estabiliza a melodia, mas preserva nuances.
    smooth_midi = median_filter(filled, size=7, mode="nearest")
    smooth_midi = gaussian_filter1d(smooth_midi, sigma=0.75, mode="nearest")

    note_frames = np.rint(smooth_midi).astype(np.int16)
    note_frames[~raw_valid] = -1

    frames_per_second = sr / hop
    note_frames = _fill_short_note_gaps(
        note_frames,
        max_gap=max(1, int(round(0.28 * frames_per_second))),
    )
    note_frames = _clean_short_note_runs(
        note_frames,
        min_frames=max(2, int(round(0.070 * frames_per_second))),
    )
    note_frames = _fill_short_note_gaps(
        note_frames,
        max_gap=max(1, int(round(0.18 * frames_per_second))),
    )

    stable_valid = note_frames >= 0
    if np.count_nonzero(stable_valid) < 3:
        sf.write(out_path, np.zeros((target_len, 2), dtype=np.float32), sr, subtype="PCM_16")
        return {
            "voicedPercent": 0.0,
            "medianHz": 0.0,
            "noteSegments": 0,
            "tracker": "TorchCrepe + pYIN",
            "crepeVoicedPercent": round(float(np.mean(crepe_good) * 100.0), 1),
            "pyinVoicedPercent": round(float(np.mean(pyin_good) * 100.0), 1),
        }

    stable_pitch = note_frames.astype(np.float64)
    stable_pitch[~stable_valid] = np.nan

    # Mantém até ~20 cents da curva real para a flauta não virar um teclado.
    expressive_residual = np.clip(
        smooth_midi - np.rint(smooth_midi),
        -0.20,
        0.20,
    )

    frame_pitch = np.full(frame_count, np.nan, dtype=np.float64)
    i = 0
    while i < frame_count:
        if not np.isfinite(stable_pitch[i]):
            i += 1
            continue
        j = i + 1
        while j < frame_count and np.isfinite(stable_pitch[j]):
            j += 1

        phrase = stable_pitch[i:j] + 0.38 * expressive_residual[i:j]
        phrase = gaussian_filter1d(phrase, sigma=1.10, mode="nearest")
        frame_pitch[i:j] = phrase
        i = j

    valid_pitch = np.isfinite(frame_pitch)
    px = np.flatnonzero(valid_pitch)
    interp_pitch = np.interp(
        np.arange(frame_count, dtype=np.float64),
        px,
        frame_pitch[valid_pitch],
    )
    interp_hz = 440.0 * np.power(2.0, (interp_pitch - 69.0) / 12.0)

    rms_norm = np.clip(rms / rms_peak, 0.0, 1.0)
    gate_frames = gaussian_filter1d(stable_valid.astype(np.float64), sigma=2.6)
    dynamics = gaussian_filter1d(np.power(rms_norm, 0.42), sigma=8.0)
    amp_frames = np.clip((0.50 + 0.50 * dynamics) * gate_frames, 0.0, 1.0)

    frame_times = np.arange(frame_count, dtype=np.float64) * hop / sr
    sample_times = np.arange(target_len, dtype=np.float64) / sr
    freq = np.interp(
        sample_times,
        frame_times,
        interp_hz,
        left=interp_hz[0],
        right=interp_hz[-1],
    )
    amp = np.interp(sample_times, frame_times, amp_frames, left=0.0, right=0.0)

    # Vibrato muito discreto, só para tirar a sensação de oscilador estático.
    vibrato_cents = 3.2 * np.sin(2.0 * np.pi * 5.1 * sample_times)
    freq = freq * np.power(2.0, vibrato_cents / 1200.0)

    phase = 2.0 * np.pi * np.cumsum(freq) / sr
    tone = (
        1.00 * np.sin(phase)
        + 0.105 * np.sin(2.0 * phase + 0.13)
        + 0.032 * np.sin(3.0 * phase + 0.29)
        + 0.009 * np.sin(4.0 * phase + 0.47)
    )

    rng = np.random.default_rng(20260928)
    breath = rng.standard_normal(target_len)
    breath = gaussian_filter1d(breath, sigma=3.0)
    breath /= max(float(np.max(np.abs(breath))), 1e-9)

    mono = (tone + 0.009 * breath) * amp

    d1 = int(0.029 * sr)
    d2 = int(0.047 * sr)
    left = mono.copy()
    right = mono.copy()
    if d1 < target_len:
        left[d1:] += mono[:-d1] * 0.080
    if d2 < target_len:
        right[d2:] += mono[:-d2] * 0.066

    stereo = np.column_stack([left, right])
    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    if peak > 1e-8:
        stereo = stereo * (0.86 / peak)

    sf.write(out_path, stereo.astype(np.float32), sr, subtype="PCM_16")

    voiced_hz = 440.0 * np.power(2.0, combined[raw_valid] / 12.0 - 69.0 / 12.0)
    median_hz = float(np.median(voiced_hz)) if voiced_hz.size else 0.0

    return {
        "voicedPercent": round(float(np.mean(stable_valid) * 100.0), 1),
        "medianHz": round(median_hz, 2),
        "noteSegments": int(_count_note_segments(note_frames)),
        "tracker": "TorchCrepe full + pYIN fallback",
        "crepeVoicedPercent": round(float(np.mean(crepe_good) * 100.0), 1),
        "pyinVoicedPercent": round(float(np.mean(pyin_good) * 100.0), 1),
    }

def encode_ogg(source, target):
    run([
        "ffmpeg", "-y", "-v", "error",
        "-i", source,
        "-map", "0:a:0", "-vn",
        "-ac", "2", "-ar", str(TARGET_SR),
        "-c:a", "libvorbis", "-q:a", "8",
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


def _bandpass_stereo(audio, low_hz, high_hz, sr=TARGET_SR):
    if len(audio) < 64:
        return audio.copy()
    nyquist = sr / 2.0
    low = max(20.0, float(low_hz)) / nyquist
    high = min(float(high_hz), nyquist - 100.0) / nyquist
    sos = butter(2, [low, high], btype="bandpass", output="sos")
    out = np.zeros_like(audio, dtype=np.float32)
    for ch in range(audio.shape[1]):
        out[:, ch] = sosfiltfilt(sos, audio[:, ch]).astype(np.float32)
    return out


def _normalize_peak(audio, peak_target=0.90):
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1e-8:
        audio = audio * min(2.0, peak_target / peak)
    return np.clip(audio, -1.0, 1.0).astype(np.float32)


def build_instruments_full(stems, out_path):
    """
    Recombina guitarra + piano + other do mesmo separador.
    Separar cada instrumento tira parte do corpo; somar os três recupera
    muito do acompanhamento original sem trazer voz, bateria ou baixo.
    """
    guitar = read_stereo(stems["guitar"])
    piano = read_stereo(stems["piano"])
    other = read_stereo(stems["other"])
    n = min(len(guitar), len(piano), len(other))
    mix = guitar[:n] + piano[:n] + other[:n]
    mix = _normalize_peak(mix, 0.91)
    sf.write(out_path, mix, TARGET_SR, subtype="PCM_16")


def build_full_body_guitar(stems, out_path):
    """
    Mantém o stem de guitarra como base, mas devolve um pouco dos médios-graves
    que o separador costuma jogar no stem 'other'. O reforço é filtrado e baixo
    para não transformar a faixa de guitarra em um mix de tudo.
    """
    guitar = read_stereo(stems["guitar"])
    other = read_stereo(stems["other"])
    piano = read_stereo(stems["piano"])
    n = min(len(guitar), len(other), len(piano))
    guitar = guitar[:n]
    other = other[:n]
    piano = piano[:n]

    low_mid_residual = _bandpass_stereo(other, 110.0, 1800.0)
    harmonic_residual = _bandpass_stereo(other, 1800.0, 6500.0)
    piano_body = _bandpass_stereo(piano, 160.0, 850.0)

    enhanced = (
        guitar
        + 0.20 * low_mid_residual
        + 0.055 * harmonic_residual
        + 0.035 * piano_body
    )

    # Saturação bem leve para recuperar densidade percebida sem "estourar".
    enhanced = np.tanh(enhanced * 1.10) / np.tanh(1.10)
    enhanced = _normalize_peak(enhanced, 0.91)
    sf.write(out_path, enhanced, TARGET_SR, subtype="PCM_16")


def build_full_body_piano(stems, out_path):
    """
    Faz o mesmo tratamento de corpo para piano/teclas.
    O stem do piano continua sendo a base; recuperamos só uma parte dos
    médios-graves e harmônicos que normalmente vazam para 'other'.
    """
    piano = read_stereo(stems["piano"])
    other = read_stereo(stems["other"])
    guitar = read_stereo(stems["guitar"])
    n = min(len(piano), len(other), len(guitar))
    piano = piano[:n]
    other = other[:n]
    guitar = guitar[:n]

    body_residual = _bandpass_stereo(other, 90.0, 1500.0)
    presence_residual = _bandpass_stereo(other, 1500.0, 5200.0)
    guitar_warmth = _bandpass_stereo(guitar, 120.0, 700.0)

    enhanced = (
        piano
        + 0.22 * body_residual
        + 0.045 * presence_residual
        + 0.025 * guitar_warmth
    )

    enhanced = np.tanh(enhanced * 1.09) / np.tanh(1.09)
    enhanced = _normalize_peak(enhanced, 0.91)
    sf.write(out_path, enhanced, TARGET_SR, subtype="PCM_16")


def build_layer_mix(paths, out_path):
    parts = [read_stereo(path) for path in paths]
    n = min(len(x) for x in parts)
    mix = np.zeros((n, 2), dtype=np.float32)
    for part in parts:
        mix += part[:n]
    mix = _normalize_peak(mix, 0.91)
    sf.write(out_path, mix, TARGET_SR, subtype="PCM_16")


def build_mix(stems, flute_path, instruments_path, out_path):
    parts = [
        read_stereo(stems["drums"]),
        read_stereo(stems["bass"]),
        read_stereo(instruments_path),
        read_stereo(flute_path),
    ]

    n = min(len(x) for x in parts)
    mix = np.zeros((n, 2), dtype=np.float32)
    for part in parts:
        mix += part[:n]

    mix = _normalize_peak(mix, 0.91)
    sf.write(out_path, mix, TARGET_SR, subtype="PCM_16")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--source-path", default="")
    parser.add_argument("--start", type=float, default=None)
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
        if args.start is None:
            clip_start, choice = choose_clip_start(source, work)
            choice["mode"] = "automatic"
        else:
            duration_probe, _ = librosa.load(source, sr=11025, mono=True, duration=None)
            duration_seconds = len(duration_probe) / 11025.0
            clip_start = max(0.0, min(float(args.start), max(0.0, duration_seconds - CLIP_SECONDS)))
            choice = {
                "duration": round(duration_seconds, 3),
                "candidates": 1,
                "score": None,
                "mode": "manual",
            }
        print(f"Trecho escolhido: {clip_start:.2f}s", flush=True)
        clip = extract_clip(source, clip_start, work)
        stems = separate_stems(clip, work)

        flute_wav = work / "melody-flute.wav"
        flute_stats = synthesize_flute(stems["vocals"], flute_wav)

        instruments_wav = work / "instruments-full.wav"
        build_instruments_full(stems, instruments_wav)

        guitar_full_wav = work / "guitar-full-body.wav"
        build_full_body_guitar(stems, guitar_full_wav)

        piano_full_wav = work / "piano-full-body.wav"
        build_full_body_piano(stems, piano_full_wav)

        mix_wav = work / "instrumental-with-flute.wav"
        build_mix(stems, flute_wav, instruments_wav, mix_wav)

        # Simulação exata da progressão de 5 faixas do jogo.
        game_round_1 = work / "game-round-1.wav"
        game_round_2 = work / "game-round-2.wav"
        game_round_3 = work / "game-round-3.wav"
        game_round_4 = work / "game-round-4.wav"
        game_round_5 = clip

        build_layer_mix([stems["drums"]], game_round_1)
        build_layer_mix([stems["drums"], stems["bass"]], game_round_2)
        build_layer_mix(
            [stems["drums"], stems["bass"], instruments_wav],
            game_round_3,
        )
        build_layer_mix(
            [stems["drums"], stems["bass"], instruments_wav, flute_wav],
            game_round_4,
        )

        outputs = {
            "preview": mix_wav,
            "flute": flute_wav,
            "drums": stems["drums"],
            "bass": stems["bass"],
            "instruments": instruments_wav,
            "guitar": guitar_full_wav,
            "piano": piano_full_wav,
            "other": stems["other"],
            "vocals": stems["vocals"],
            "original": clip,
        }

        labels = {
            "preview": "Mix sem voz + flauta",
            "flute": "Melodia em flauta",
            "drums": "Bateria",
            "bass": "Baixo",
            "instruments": "Instrumentos completos",
            "guitar": "Guitarra / violão (encorpada)",
            "piano": "Piano / teclas (encorpado)",
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

        game_round_sources = [
            game_round_1,
            game_round_2,
            game_round_3,
            game_round_4,
            game_round_5,
        ]
        for index, source_path in enumerate(game_round_sources, start=1):
            encode_ogg(source_path, OUT_DIR / f"game-round-{index}.ogg")

        manifest = {
            "version": 1,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceName": safe_name(source),
            "sourcePath": (args.source_path or str(source)).replace("\\", "/"),
            "clipStart": round(float(clip_start), 3),
            "clipSeconds": CLIP_SECONDS,
            "selection": choice,
            "separationModel": "Hybrid: htdemucs_ft (drums/bass) + BS-Roformer-SW (vocals/instruments)",
            "voiceTransform": "neural stabilized flute (TorchCrepe full + pYIN fallback, no MIDI)",
            "instrumentBody": "recombined accompaniment + filtered residual body restoration",
            "webAudioEncoding": "Ogg Vorbis q8",
            "flute": flute_stats,
            "tracks": tracks,
            "gameRounds": [
                {
                    "index": 1,
                    "label": "Bateria",
                    "url": "/stem-flute-lab/game-round-1.ogg",
                },
                {
                    "index": 2,
                    "label": "Baixo",
                    "url": "/stem-flute-lab/game-round-2.ogg",
                },
                {
                    "index": 3,
                    "label": "Instrumentos",
                    "url": "/stem-flute-lab/game-round-3.ogg",
                },
                {
                    "index": 4,
                    "label": "Melodia",
                    "url": "/stem-flute-lab/game-round-4.ogg",
                },
                {
                    "index": 5,
                    "label": "Revelação",
                    "url": "/stem-flute-lab/game-round-5.ogg",
                },
            ],
        }
        (OUT_DIR / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print("Stem + Flauta Lab pronto.", flush=True)


if __name__ == "__main__":
    main()
