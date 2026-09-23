#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import pretty_midi
from scipy.ndimage import median_filter


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def estimate_tempo(audio_path: Path) -> float:
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    value = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 120.0
    if not np.isfinite(value) or value < 45 or value > 240:
        value = 120.0
    return value


def merge_short_gaps(notes, gap=0.08):
    merged = []
    for note in notes:
        if merged and note[0] == merged[-1][0] and note[1] - merged[-1][2] <= gap:
            merged[-1][2] = note[2]
            merged[-1][3] = max(merged[-1][3], note[3])
        else:
            merged.append(note[:])
    return merged


def pyin_notes(audio_path: Path, fmin_note: str, fmax_note: str, min_midi: int, max_midi: int,
               velocity=96, min_duration=0.06, hop=256, confidence=0.42):
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    if np.max(np.abs(y)) < 1e-5:
        return []

    y_harm = librosa.effects.harmonic(y, margin=3.0)
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y_harm,
        fmin=librosa.note_to_hz(fmin_note),
        fmax=librosa.note_to_hz(fmax_note),
        sr=sr,
        frame_length=2048,
        hop_length=hop,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop)
    midi = np.full(len(f0), np.nan)
    valid = np.isfinite(f0)
    midi[valid] = librosa.hz_to_midi(f0[valid])
    filled = np.where(np.isfinite(midi), midi, 0.0)
    smooth = median_filter(filled, size=3)
    rounded = np.rint(smooth).astype(int)

    notes = []
    current = None
    start = None
    probs = []

    for i, t in enumerate(times):
        ok = bool(voiced_flag[i]) and np.isfinite(f0[i]) and float(voiced_prob[i]) >= confidence
        pitch = int(rounded[i]) if ok else None
        if ok and min_midi <= pitch <= max_midi:
            if current is not None and abs(pitch - current) == 1 and len(probs) < 3:
                pitch = current
            if current is None:
                current, start, probs = pitch, float(t), [float(voiced_prob[i])]
            elif pitch == current:
                probs.append(float(voiced_prob[i]))
            else:
                end = float(t)
                if end - start >= min_duration:
                    mean_prob = float(np.mean(probs)) if probs else confidence
                    vel = int(np.clip(velocity * (0.78 + 0.28 * mean_prob), 45, 118))
                    notes.append([current, start, end, vel])
                current, start, probs = pitch, float(t), [float(voiced_prob[i])]
        elif current is not None:
            end = float(t)
            if end - start >= min_duration:
                mean_prob = float(np.mean(probs)) if probs else confidence
                vel = int(np.clip(velocity * (0.78 + 0.28 * mean_prob), 45, 118))
                notes.append([current, start, end, vel])
            current, start, probs = None, None, []

    if current is not None:
        end = len(y) / sr
        if end - start >= min_duration:
            mean_prob = float(np.mean(probs)) if probs else confidence
            vel = int(np.clip(velocity * (0.78 + 0.28 * mean_prob), 45, 118))
            notes.append([current, start, end, vel])

    return merge_short_gaps(notes)


def transcribe_other_basic_pitch(audio_path: Path):
    try:
        from basic_pitch.inference import predict
        _, midi_data, note_events = predict(str(audio_path))
        result = []
        for inst in midi_data.instruments:
            if inst.is_drum:
                continue
            for n in inst.notes:
                if n.end - n.start < 0.045:
                    continue
                if 36 <= n.pitch <= 100:
                    result.append([int(n.pitch), float(n.start), float(n.end), int(np.clip(n.velocity, 35, 105))])
        result.sort(key=lambda x: (x[1], x[0]))
        return result, len(note_events or [])
    except Exception as exc:
        print(f"WARNING: Basic Pitch failed on other stem: {exc}", file=sys.stderr)
        return [], 0


def drum_notes(audio_path: Path):
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    hop = 256
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr, hop_length=hop, backtrack=False, units="frames",
        pre_max=3, post_max=3, pre_avg=8, post_avg=8, delta=0.12, wait=2
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    max_rms = max(float(np.max(rms)), 1e-7)

    hits = []
    for fr, t in zip(onset_frames, onset_times):
        fr = int(np.clip(fr, 0, S.shape[1] - 1))
        spec = S[:, fr]
        total = float(np.sum(spec)) + 1e-9
        low = float(np.sum(spec[freqs < 170])) / total
        high = float(np.sum(spec[freqs >= 3200])) / total
        centroid = float(np.sum(freqs * spec) / total)
        energy = float(rms[min(fr, len(rms)-1)]) / max_rms

        if low > 0.30 and centroid < 1800:
            pitch = 36
        elif high > 0.34 or centroid > 4200:
            pitch = 42
        else:
            pitch = 38
        vel = int(np.clip(58 + energy * 62, 50, 120))
        hits.append([pitch, float(t), min(len(y) / sr, float(t) + 0.075), vel])
    return hits


def add_notes(inst, notes):
    for pitch, start, end, velocity in notes:
        if end <= start:
            continue
        inst.notes.append(pretty_midi.Note(
            velocity=int(np.clip(velocity, 1, 127)),
            pitch=int(np.clip(pitch, 0, 127)),
            start=max(0.0, float(start)),
            end=max(float(start) + 0.02, float(end)),
        ))


def save_single_track(notes, program, name, tempo, path, is_drum=False):
    pm = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    inst = pretty_midi.Instrument(program=program, is_drum=is_drum, name=name)
    add_notes(inst, notes)
    pm.instruments.append(inst)
    pm.write(str(path))


def render_preview(midi_path: Path, out_path: Path, soundfont: str):
    if not soundfont or not Path(soundfont).exists():
        print("No soundfont; skipping preview render")
        return False
    wav = out_path.with_suffix(".wav")
    run(["fluidsynth", "-ni", "-g", "0.72", "-F", wav, "-r", "44100", soundfont, midi_path])
    run([
        "ffmpeg", "-y", "-v", "error", "-i", wav,
        "-af", "alimiter=limit=0.96", "-c:a", "libmp3lame", "-q:a", "3", out_path
    ])
    wav.unlink(missing_ok=True)
    return True


def separate_demucs(audio: Path, work_dir: Path, model: str):
    sep_root = work_dir / "separated"
    run([sys.executable, "-m", "demucs.separate", "-n", model, "--out", sep_root, audio])
    candidates = list((sep_root / model).glob("*"))
    if not candidates:
        raise RuntimeError("Demucs finished but no stem directory was found.")
    stem_dir = candidates[0]
    stems = {name: stem_dir / f"{name}.wav" for name in ("vocals", "bass", "drums", "other")}
    missing = [str(p) for p in stems.values() if not p.exists()]
    if missing:
        raise RuntimeError("Missing Demucs stems: " + ", ".join(missing))
    return stems


def main():
    ap = argparse.ArgumentParser(description="Experimental audio -> multitrack MIDI converter")
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--model", default="htdemucs")
    ap.add_argument("--soundfont", default=os.environ.get("SOUNDFONT_PATH", ""))
    args = ap.parse_args()

    audio = Path(args.audio).resolve()
    out_dir = Path(args.out_dir).resolve()
    if not audio.exists():
        raise SystemExit(f"Audio not found: {audio}")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tempo = estimate_tempo(audio)
    print(f"Estimated tempo: {tempo:.2f} BPM")

    work_dir = out_dir / "_work"
    work_dir.mkdir(parents=True, exist_ok=True)
    stems = separate_demucs(audio, work_dir, args.model)

    vocals = pyin_notes(stems["vocals"], "C3", "C6", 48, 88, velocity=100, confidence=0.38)
    bass = pyin_notes(stems["bass"], "E1", "C4", 28, 60, velocity=92, min_duration=0.075, confidence=0.34)
    other, other_events = transcribe_other_basic_pitch(stems["other"])
    drums = drum_notes(stems["drums"])

    if len(other) > 1800:
        other = sorted(other, key=lambda x: (x[3], x[2] - x[1]), reverse=True)[:1800]
        other.sort(key=lambda x: (x[1], x[0]))

    pm = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    vocal_inst = pretty_midi.Instrument(program=81, name="Voz / melodia")
    bass_inst = pretty_midi.Instrument(program=33, name="Baixo")
    other_inst = pretty_midi.Instrument(program=27, name="Harmonia / outros")
    drum_inst = pretty_midi.Instrument(program=0, is_drum=True, name="Bateria")
    add_notes(vocal_inst, vocals)
    add_notes(bass_inst, bass)
    add_notes(other_inst, other)
    add_notes(drum_inst, drums)
    pm.instruments.extend([drum_inst, bass_inst, other_inst, vocal_inst])

    multitrack = out_dir / "multitrack.mid"
    pm.write(str(multitrack))
    save_single_track(vocals, 81, "Voz / melodia", tempo, out_dir / "vocals.mid")
    save_single_track(bass, 33, "Baixo", tempo, out_dir / "bass.mid")
    save_single_track(other, 27, "Harmonia / outros", tempo, out_dir / "other.mid")
    save_single_track(drums, 0, "Bateria", tempo, out_dir / "drums.mid", is_drum=True)

    preview_ok = render_preview(multitrack, out_dir / "preview.mp3", args.soundfont)

    report = {
        "source": audio.name,
        "demucsModel": args.model,
        "tempoBpm": round(tempo, 2),
        "tracks": {
            "vocals": len(vocals),
            "bass": len(bass),
            "other": len(other),
            "drums": len(drums),
        },
        "basicPitchEvents": int(other_events),
        "previewRendered": preview_ok,
        "files": ["multitrack.mid", "vocals.mid", "bass.mid", "other.mid", "drums.mid"] + (["preview.mp3"] if preview_ok else []),
    }
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(work_dir, ignore_errors=True)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
