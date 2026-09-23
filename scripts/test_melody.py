#!/usr/bin/env python3
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d, median_filter

import process_upload as pu


ROOT = Path(__file__).resolve().parents[1]
LAB_MANIFEST = ROOT / "separation-tests" / "lab" / "manifest.json"
OUTPUT_DIR = ROOT / "separation-tests" / "melody"
CLIP_SECONDS = pu.CLIP_SECONDS


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def extract_clip(source, start, output):
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


def load_previous_lab():
    if not LAB_MANIFEST.exists():
        return {}
    try:
        return json.loads(LAB_MANIFEST.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Aviso: não consegui ler manifest anterior: {exc}", flush=True)
        return {}


def continuous_pitch_crepe(vocal_path):
    try:
        import torch
        import torchcrepe
    except Exception as exc:
        raise RuntimeError(f"torchcrepe indisponível: {exc}")

    y, sr = sf.read(vocal_path, dtype="float32", always_2d=True)
    mono = np.mean(y, axis=1).astype(np.float32)

    if sr != 16000:
        mono16 = librosa.resample(mono, orig_sr=sr, target_sr=16000).astype(np.float32)
    else:
        mono16 = mono

    # Evita picos fora de escala sem destruir a dinâmica relativa.
    peak = float(np.max(np.abs(mono16))) if len(mono16) else 0.0
    if peak > 0.98:
        mono16 = mono16 * (0.98 / peak)

    audio = torch.from_numpy(mono16).unsqueeze(0)

    with torch.no_grad():
        pitch, periodicity = torchcrepe.predict(
            audio,
            16000,
            160,
            65.0,
            1000.0,
            "full",
            1024,
            "cpu",
            return_periodicity=True,
        )

    pitch = pitch.squeeze(0).detach().cpu().numpy().astype(np.float64)
    periodicity = periodicity.squeeze(0).detach().cpu().numpy().astype(np.float64)

    if not len(pitch):
        raise RuntimeError("CREPE não retornou frames de pitch.")

    # O CREPE retorna frequência mesmo em ruído. A periodicidade define quando
    # realmente existe uma linha vocal confiável.
    voiced = periodicity >= 0.20
    pitch = np.where(voiced, pitch, np.nan)

    # Remove saltos isolados óbvios, mas mantém vibrato e slides.
    midi = librosa.hz_to_midi(pitch)
    finite = np.isfinite(midi)
    if np.any(finite):
        filled = midi.copy()
        indices = np.arange(len(midi))
        filled[~finite] = np.interp(indices[~finite], indices[finite], midi[finite])
        filtered = median_filter(filled, size=3, mode="nearest")

        # Só corrige frames com saltos muito improváveis em relação à mediana.
        jump = np.abs(filled - filtered)
        filled[jump > 4.5] = filtered[jump > 4.5]
        pitch_clean = librosa.midi_to_hz(filled)
        pitch = np.where(voiced, pitch_clean, np.nan)

    # Dinâmica da voz original em janelas de 10 ms.
    hop44 = max(1, int(round(sr * 0.01)))
    rms = librosa.feature.rms(
        y=mono,
        frame_length=2048,
        hop_length=hop44,
        center=True,
    )[0].astype(np.float64)

    if len(rms) != len(pitch):
        src = np.linspace(0.0, 1.0, max(1, len(rms)))
        dst = np.linspace(0.0, 1.0, len(pitch))
        rms = np.interp(dst, src, rms)

    high = float(np.percentile(rms, 95)) if len(rms) else 0.0
    if high > 1e-8:
        dynamics = np.clip(rms / high, 0.0, 1.25)
    else:
        dynamics = np.zeros_like(pitch)

    gate = voiced.astype(np.float64)
    # Attack/release suave sem apagar pausas reais.
    gate = gaussian_filter1d(gate, sigma=1.5)
    gate = np.clip(gate, 0.0, 1.0)

    dynamics = gaussian_filter1d(dynamics, sigma=1.2)
    dynamics = np.sqrt(np.clip(dynamics, 0.0, 1.0)) * gate

    times = np.arange(len(pitch), dtype=np.float64) * 0.01
    return times, pitch, dynamics, periodicity


def synthesize_continuous(times, pitch, dynamics, out_path, soft=False):
    sr = 44100
    sample_count = int(round(CLIP_SECONDS * sr))
    sample_times = np.arange(sample_count, dtype=np.float64) / sr

    valid = np.isfinite(pitch)
    if not np.any(valid):
        sf.write(out_path, np.zeros((sample_count, 2), dtype=np.float32), sr, subtype="PCM_16")
        return

    # Para interpolar o pitch, preenche apenas internamente; o gate impede som
    # em frames sem voz. Assim slides e vibrato continuam contínuos.
    filled_pitch = pitch.copy()
    idx = np.arange(len(pitch))
    filled_pitch[~valid] = np.interp(idx[~valid], idx[valid], pitch[valid])

    if soft:
        # A versão suave conserva a frase, mas tira micro-jitter de tracking.
        midi = librosa.hz_to_midi(filled_pitch)
        midi = gaussian_filter1d(midi, sigma=1.4)
        filled_pitch = librosa.midi_to_hz(midi)

    freq = np.interp(sample_times, times, filled_pitch, left=filled_pitch[0], right=filled_pitch[-1])
    amp = np.interp(sample_times, times, dynamics, left=0.0, right=0.0)

    phase = np.cumsum((2.0 * math.pi * freq) / sr)

    if soft:
        # Timbre redondo / flute-lead: menos harmônicos, frase em primeiro plano.
        tone = (
            np.sin(phase)
            + 0.075 * np.sin(2.0 * phase)
            + 0.018 * np.sin(3.0 * phase)
        )
        level = 0.30
    else:
        # Lead mais definido, preservando a curva humana de pitch e volume.
        tone = (
            np.sin(phase)
            + 0.16 * np.sin(2.0 * phase)
            + 0.045 * np.sin(3.0 * phase)
            + 0.012 * np.sin(4.0 * phase)
        )
        level = 0.285

    signal = tone * amp * level

    # Limite transparente.
    peak = float(np.max(np.abs(signal))) if len(signal) else 0.0
    if peak > 0.88:
        signal *= 0.88 / peak

    stereo = np.column_stack([signal, signal]).astype(np.float32)
    sf.write(out_path, stereo, sr, subtype="PCM_16")


def encode_pair(instrumental, melody, target):
    target.mkdir(parents=True, exist_ok=True)
    pu.encode_or_mix([melody], target / "melody.ogg")
    pu.encode_or_mix(
        [instrumental, melody],
        target / "round-4.ogg",
        gains=[0.68, 1.18],
    )


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

    previous = load_previous_lab()

    title = args.title.strip() or str(previous.get("title", "")).strip()
    artist = args.artist.strip() or str(previous.get("artist", "")).strip()
    title, artist = pu.infer_metadata(source, title, artist)

    raw_start = args.clip_start.strip()
    if not raw_start:
        raw_start = str(previous.get("clipStart", "")).strip()

    if raw_start:
        try:
            start = max(0.0, float(raw_start.replace(",", ".")))
        except ValueError:
            raise SystemExit("--clip-start precisa ser um número em segundos")
    else:
        with tempfile.TemporaryDirectory(prefix="mdd-melody-select-") as t:
            selection = Path(t)
            start = pu.choose_clip_start(source, selection)

    print(f"Teste de melodia: {artist} — {title}", flush=True)
    print(f"Trecho: {start:.1f}s → {start + CLIP_SECONDS:.1f}s", flush=True)

    if OUTPUT_DIR.exists():
        import shutil
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mdd-melody-lab-") as tmp:
        work = Path(tmp)
        clip = extract_clip(source, start, work / "clip.wav")

        # Separa a voz uma única vez. O teste compara somente o rastreamento /
        # síntese da melodia, não os separadores.
        karaoke = pu.separate_vocal_instrumental(clip, work)

        current_wav = work / "melody-current.wav"
        expressive_wav = work / "melody-expressive.wav"
        soft_wav = work / "melody-soft.wav"

        pu.synthesize_vocal_melody(karaoke["vocals"], current_wav)

        times, pitch, dynamics, periodicity = continuous_pitch_crepe(karaoke["vocals"])
        synthesize_continuous(times, pitch, dynamics, expressive_wav, soft=False)
        synthesize_continuous(times, pitch, dynamics, soft_wav, soft=True)

        encode_pair(karaoke["instrumental"], current_wav, OUTPUT_DIR / "current")
        encode_pair(karaoke["instrumental"], expressive_wav, OUTPUT_DIR / "expressive")
        encode_pair(karaoke["instrumental"], soft_wav, OUTPUT_DIR / "soft")

        voiced_ratio = float(np.mean(np.isfinite(pitch))) if len(pitch) else 0.0
        periodicity_mean = float(np.mean(periodicity)) if len(periodicity) else 0.0

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "title": title,
        "artist": artist,
        "sourceName": source.name,
        "clipStart": round(float(start), 2),
        "clipSeconds": CLIP_SECONDS,
        "analysis": {
            "voicedRatio": round(voiced_ratio, 4),
            "meanPeriodicity": round(periodicity_mean, 4),
        },
        "methods": [
            {
                "id": "current",
                "name": "Atual · Basic Pitch",
                "description": "Notas discretas e estáveis, como a rodada 4 do jogo hoje.",
                "solo": "separation-tests/melody/current/melody.ogg",
                "mixed": "separation-tests/melody/current/round-4.ogg",
            },
            {
                "id": "expressive",
                "name": "Expressiva · CREPE",
                "description": "Pitch contínuo com slides, vibrato e dinâmica extraídos da voz.",
                "solo": "separation-tests/melody/expressive/melody.ogg",
                "mixed": "separation-tests/melody/expressive/round-4.ogg",
            },
            {
                "id": "soft",
                "name": "Expressiva suave",
                "description": "Mesma frase contínua, com micro-jitter suavizado e timbre mais redondo.",
                "solo": "separation-tests/melody/soft/melody.ogg",
                "mixed": "separation-tests/melody/soft/round-4.ogg",
            },
        ],
    }

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
