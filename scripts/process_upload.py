#!/usr/bin/env python3
import argparse
import json
import math
import os
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
from basic_pitch.inference import predict as basic_pitch_predict
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

    # Evita intros e, principalmente, finais/outros. Esses trechos costumam
    # concentrar backing vocals e camadas que atrapalham a transcrição da voz.
    min_start = int(max(12.0, duration * 0.18))
    max_start = int(min(duration - CLIP_SECONDS - 8.0, duration * 0.62))

    if max_start <= min_start:
        min_start = 0
        max_start = len(rolling) - 1

    lo = max(0, min_start)
    hi = min(len(rolling) - 1, max_start)
    if hi < lo:
        return max(0.0, (duration - CLIP_SECONDS) / 2)

    region = rolling[lo:hi + 1].astype(np.float64)
    if np.max(region) > np.min(region):
        loudness = (region - np.min(region)) / (np.max(region) - np.min(region))
    else:
        loudness = np.ones_like(region)

    starts = np.arange(lo, hi + 1, dtype=np.float64)
    preferred = duration * 0.46
    distance = np.abs(starts - preferred) / max(duration * 0.24, 1.0)

    # A atividade musical ainda pesa mais, mas damos preferência ao miolo da
    # faixa em vez de escolher cegamente o trecho mais alto do final.
    score = loudness - 0.48 * distance
    best = lo + int(np.argmax(score))
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


def separate_vocal_instrumental(clip, work):
    """Roda BS-Roformer em um ambiente Python isolado do Basic Pitch."""
    out = work / "roformer"
    out.mkdir(parents=True, exist_ok=True)

    model_dir = Path.home() / ".cache" / "audio-separator-models"
    model_dir.mkdir(parents=True, exist_ok=True)

    separator_bin = Path(
        os.environ.get(
            "AUDIO_SEPARATOR_BIN",
            str(Path(sys.executable).with_name("audio-separator")),
        )
    )

    if not separator_bin.exists():
        raise RuntimeError(f"audio-separator não encontrado: {separator_bin}")

    run([
        separator_bin,
        clip,
        "--model_filename", "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "--output_format", "WAV",
        "--output_dir", out,
        "--model_file_dir", model_dir,
        "--normalization", "0.9",
    ])

    wavs = list(out.glob("*.wav"))
    vocals = next(
        (p for p in wavs if "vocal" in p.name.lower()),
        None,
    )
    instrumental = next(
        (p for p in wavs if "instrumental" in p.name.lower() or "karaoke" in p.name.lower()),
        None,
    )

    if not vocals or not instrumental:
        found = [p.name for p in wavs]
        raise RuntimeError(
            "BS-Roformer não gerou os stems esperados. Arquivos: " + ", ".join(found)
        )

    print(f"BS-Roformer vocal: {vocals.name}", flush=True)
    print(f"BS-Roformer instrumental: {instrumental.name}", flush=True)

    return {
        "vocals": vocals,
        "instrumental": instrumental,
    }


def synthesize_vocal_melody(vocal_path, out_path):
    """Transcreve o stem vocal em notas e escolhe uma linha melódica principal."""
    _, _, note_events = basic_pitch_predict(
        str(vocal_path),
        onset_threshold=0.46,
        frame_threshold=0.30,
        minimum_note_length=80.0,
        minimum_frequency=75.0,
        maximum_frequency=1000.0,
        multiple_pitch_bends=False,
        melodia_trick=True,
    )

    events = []
    for start, end, pitch, amplitude, _pitch_bend in note_events:
        start = float(start)
        end = float(end)
        amplitude = float(amplitude)
        pitch = int(pitch)

        duration = end - start
        if duration < 0.08:
            continue
        if amplitude < 0.12:
            continue
        if pitch < 38 or pitch > 84:
            continue

        events.append({
            "start": max(0.0, start),
            "end": min(CLIP_SECONDS, end),
            "pitch": pitch,
            "amp": amplitude,
        })

    print(f"Basic Pitch: {len(note_events)} eventos brutos, {len(events)} eventos úteis.", flush=True)

    if not events:
        sf.write(
            out_path,
            np.zeros((int(CLIP_SECONDS * 44100), 2), dtype=np.float32),
            44100,
            subtype="PCM_16",
        )
        return

    # Converte os eventos potencialmente polifônicos em uma única melodia.
    # O Viterbi favorece notas fortes e longas, mas penaliza saltos bruscos,
    # evitando pular aleatoriamente entre lead vocal e backing vocals.
    step = 0.02
    frame_count = int(math.ceil(CLIP_SECONDS / step))
    frame_candidates = []

    for frame in range(frame_count):
        t = frame * step
        by_pitch = {}

        for event in events:
            if event["start"] <= t < event["end"]:
                pitch = event["pitch"]
                amp = event["amp"]
                if pitch not in by_pitch or amp > by_pitch[pitch]:
                    by_pitch[pitch] = amp

        frame_candidates.append(by_pitch)

    prev_scores = {-1: 0.0}
    backtrack = []

    def transition_score(prev_pitch, pitch):
        if prev_pitch == -1 and pitch == -1:
            return 0.04
        if prev_pitch == -1 or pitch == -1:
            return -0.30
        if prev_pitch == pitch:
            return 0.28

        jump = abs(pitch - prev_pitch)
        penalty = 0.075 * jump
        if jump > 7:
            penalty += 0.16 * (jump - 7)
        return -penalty

    for candidates in frame_candidates:
        states = {-1: 0.0}
        for pitch, amp in candidates.items():
            states[pitch] = 2.7 * amp

        current_scores = {}
        current_back = {}

        for pitch, emission in states.items():
            best_prev = None
            best_score = -1e18

            for prev_pitch, prev_score in prev_scores.items():
                score = prev_score + transition_score(prev_pitch, pitch) + emission
                if score > best_score:
                    best_score = score
                    best_prev = prev_pitch

            current_scores[pitch] = best_score
            current_back[pitch] = best_prev

        prev_scores = current_scores
        backtrack.append(current_back)

    final_pitch = max(prev_scores, key=prev_scores.get)
    path = [final_pitch]

    for frame in range(frame_count - 1, 0, -1):
        final_pitch = backtrack[frame][final_pitch]
        path.append(final_pitch)

    path.reverse()

    # Remove oscilações curtíssimas na linha escolhida.
    stable = np.asarray(path, dtype=np.int16)

    i = 0
    while i < len(stable):
        pitch = int(stable[i])
        j = i + 1
        while j < len(stable) and int(stable[j]) == pitch:
            j += 1

        if pitch >= 0 and (j - i) < 4:
            left = int(stable[i - 1]) if i > 0 else -1
            right = int(stable[j]) if j < len(stable) else -1
            if left >= 0 and right == left:
                stable[i:j] = left
            else:
                stable[i:j] = -1

        i = j

    segments = []
    i = 0
    while i < len(stable):
        pitch = int(stable[i])
        j = i + 1
        while j < len(stable) and int(stable[j]) == pitch:
            j += 1

        duration = (j - i) * step
        if pitch >= 0 and duration >= 0.08:
            segments.append([i * step, min(CLIP_SECONDS, j * step), pitch])

        i = j

    # Mescla a mesma nota quando há apenas uma pausa minúscula entre elas.
    merged = []
    for start, end, pitch in segments:
        if (
            merged
            and pitch == merged[-1][2]
            and start - merged[-1][1] <= 0.06
        ):
            merged[-1][1] = end
        else:
            merged.append([start, end, pitch])

    print(f"Melodia principal: {len(merged)} notas escolhidas.", flush=True)

    sr = 44100
    synth = np.zeros(int(CLIP_SECONDS * sr), dtype=np.float32)

    for start_s, end_s, pitch in merged:
        start = max(0, int(start_s * sr))
        end = min(len(synth), int(end_s * sr))
        if end <= start:
            continue

        length = end - start
        freq = float(librosa.midi_to_hz(pitch))
        t = np.arange(length, dtype=np.float64) / sr

        # Som deliberadamente instrumental e limpo.
        tone = (
            np.sin(2.0 * math.pi * freq * t)
            + 0.10 * np.sin(2.0 * math.pi * freq * 2.0 * t)
            + 0.025 * np.sin(2.0 * math.pi * freq * 3.0 * t)
        )

        env = np.ones(length, dtype=np.float64)
        attack = min(int(sr * 0.025), max(1, length // 4))
        release = min(int(sr * 0.060), max(1, length // 3))

        if attack > 1:
            env[:attack] = np.linspace(0.0, 1.0, attack)
        if release > 1:
            env[-release:] *= np.linspace(1.0, 0.0, release)

        synth[start:end] += (tone * env * 0.28).astype(np.float32)

    peak = float(np.max(np.abs(synth))) if len(synth) else 0.0
    if peak > 0.88:
        synth *= 0.88 / peak

    stereo = np.column_stack([synth, synth]).astype(np.float32)
    sf.write(out_path, stereo, sr, subtype="PCM_16")


def encode_or_mix(inputs, output, gains=None):
    gains = gains or [1.0] * len(inputs)
    if len(gains) != len(inputs):
        raise ValueError("gains precisa ter o mesmo tamanho de inputs")

    cmd = ["ffmpeg", "-y", "-v", "error"]
    for item in inputs:
        cmd += ["-i", item]

    if len(inputs) == 1 and abs(float(gains[0]) - 1.0) < 1e-6:
        cmd += [
            "-map", "0:a:0",
            "-c:a", "libopus", "-b:a", "96k",
            "-ar", "48000",
            output,
        ]
    else:
        chains = []
        labels = []
        for index, gain in enumerate(gains):
            label = f"a{index}"
            chains.append(f"[{index}:a]volume={float(gain):.4f}[{label}]")
            labels.append(f"[{label}]")

        chains.append(
            "".join(labels)
            + f"amix=inputs={len(inputs)}:duration=longest:normalize=0,"
            + "alimiter=limit=0.95[out]"
        )

        cmd += [
            "-filter_complex", ";".join(chains),
            "-map", "[out]",
            "-c:a", "libopus", "-b:a", "96k",
            "-ar", "48000",
            output,
        ]

    run(cmd)


def build_rounds(clip, stems, karaoke, target):
    target.mkdir(parents=True, exist_ok=True)
    melody = target.parent / "_melody.wav"

    # A melodia agora é extraída do vocal dedicado do BS-Roformer,
    # não do stem vocal do Demucs.
    synthesize_vocal_melody(karaoke["vocals"], melody)

    # Rodada 1 e 2: mantemos Demucs, que teve o melhor resultado prático
    # para bateria e baixo.
    encode_or_mix(
        [stems["drums"]],
        target / "round-1.ogg",
    )
    encode_or_mix(
        [stems["drums"], stems["bass"]],
        target / "round-2.ogg",
        gains=[1.0, 1.0],
    )

    # Rodada 3: instrumental sem voz. Mantemos um pouco abaixo do volume
    # máximo para os artefatos da separação não dominarem a experiência.
    encode_or_mix(
        [karaoke["instrumental"]],
        target / "round-3.ogg",
        gains=[0.82],
    )

    # Rodada 4: a melodia precisa ficar claramente audível sobre o instrumental.
    encode_or_mix(
        [karaoke["instrumental"], melody],
        target / "round-4.ogg",
        gains=[0.68, 1.18],
    )

    # Rodada 5 / revelação: toca o trecho real da música, sem separação.
    encode_or_mix(
        [clip],
        target / "round-5.ogg",
    )

    if melody.exists():
        melody.unlink()


def update_catalog(day, title, artist, start, source_name, release_year="", youtube_views="", difficulty="", youtube_url=""):
    if CATALOG_PATH.exists():
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    else:
        catalog = {"songs": []}

    previous = next((item for item in catalog.get("songs", []) if item.get("date") == day), None)
    version = int(previous.get("version", 1)) + 1 if previous else 1

    previous = previous or {}

    inferred_year = release_year.strip()
    if not inferred_year:
        year_match = re.search(r"\b(19\d{2}|20\d{2})\b", f"{title} {source_name}")
        if year_match:
            inferred_year = year_match.group(1)
        else:
            inferred_year = str(previous.get("releaseYear", "")).strip()

    views_value = youtube_views.strip() or str(previous.get("youtubeViews", "")).strip()
    difficulty_value = difficulty.strip() or str(previous.get("difficulty", "")).strip()
    youtube_url_value = youtube_url.strip() or str(previous.get("youtubeUrl", "")).strip()

    entry = {
        "date": day,
        "title": title,
        "artist": artist,
        "clipStart": round(float(start), 2),
        "source": "upload",
        "sourceName": source_name,
        "version": version,
        "releaseYear": inferred_year,
        "youtubeViews": views_value,
        "difficulty": difficulty_value,
        "youtubeUrl": youtube_url_value,
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
    parser.add_argument("--release-year", default="")
    parser.add_argument("--youtube-views", default="")
    parser.add_argument("--difficulty", default="")
    parser.add_argument("--youtube-url", default="")
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
        karaoke = separate_vocal_instrumental(clip, work)
        build_rounds(clip, stems, karaoke, target)

    entry = update_catalog(
        day,
        title,
        artist,
        start,
        source.name,
        args.release_year,
        args.youtube_views,
        args.difficulty,
        args.youtube_url,
    )
    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
