#!/usr/bin/env python3
import argparse
import bisect
import json
import os
import shutil
import statistics
import subprocess
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "midi-lab"
CLIP_SECONDS = 18.0
INSTRUMENT_VOLUME_SCALE = 0.76
MELODY_VOLUME = 112
MELODY_EXPRESSION = 118

MELODY_STYLES = {
    "bandle": {"program": 85, "name": "Lead suave (Bandle)"},
    "flute": {"program": 73, "name": "Flauta / synth suave"},
    "epiano": {"program": 4, "name": "Piano elétrico"},
    "bells": {"program": 10, "name": "Sinos / keys"},
    "bright": {"program": 81, "name": "Lead brilhante"},
}

PROGRAM_NAMES = {
    24: "Violão nylon", 25: "Violão aço", 26: "Guitarra jazz", 27: "Guitarra limpa",
    28: "Guitarra abafada", 29: "Guitarra overdrive", 30: "Guitarra distorcida",
    31: "Harmônicos de guitarra", 32: "Baixo acústico", 33: "Baixo elétrico",
    34: "Baixo com palheta", 35: "Baixo fretless", 36: "Slap bass 1", 37: "Slap bass 2",
    38: "Synth bass 1", 39: "Synth bass 2", 40: "Violino", 41: "Viola", 42: "Cello",
    43: "Contrabaixo", 48: "Cordas 1", 49: "Cordas 2", 50: "Synth strings 1",
    51: "Synth strings 2", 52: "Coro Aahs", 53: "Voz Oohs", 54: "Synth Voice",
    56: "Trompete", 57: "Trombone", 60: "French horn", 64: "Sax soprano",
    65: "Sax alto", 66: "Sax tenor", 67: "Sax barítono", 68: "Oboé", 69: "English horn",
    71: "Clarinete", 72: "Piccolo", 73: "Flauta", 74: "Recorder", 75: "Pan flute",
    80: "Lead square", 81: "Lead saw", 82: "Lead calliope", 83: "Lead chiff",
    84: "Lead charang", 85: "Lead voice", 86: "Lead fifths", 87: "Bass + Lead",
}

FAMILIES = [
    (0, 7, "Piano"), (8, 15, "Percussão melódica"), (16, 23, "Órgão"),
    (24, 31, "Guitarra"), (32, 39, "Baixo"), (40, 47, "Cordas"),
    (48, 55, "Ensemble"), (56, 63, "Metais"), (64, 71, "Sopros"),
    (72, 79, "Flauta / sopro"), (80, 87, "Synth lead"), (88, 95, "Synth pad"),
    (96, 103, "Synth / efeitos"), (104, 111, "Instrumento étnico"),
    (112, 119, "Percussão"), (120, 127, "Efeito"),
]


def run(cmd):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], check=True)


def family_for_program(program):
    for lo, hi, name in FAMILIES:
        if lo <= program <= hi:
            return name
    return "Instrumento"


def program_name(program):
    return PROGRAM_NAMES.get(program, family_for_program(program))


def build_timeline(mid):
    merged = mido.merge_tracks(mid.tracks)
    tempo = 500000
    abs_tick = 0
    abs_sec = 0.0
    records = []
    lyrics = []
    for msg in merged:
        abs_tick += msg.time
        abs_sec += mido.tick2second(msg.time, mid.ticks_per_beat, tempo)
        clean = msg.copy(time=0)
        records.append({"tick": abs_tick, "sec": abs_sec, "msg": clean})
        if msg.type == "set_tempo":
            tempo = msg.tempo
        if msg.type == "lyrics":
            text = str(getattr(msg, "text", "") or "").strip()
            if text and text not in {"\\r", "\\n"}:
                lyrics.append((abs_sec, text))
    return records, lyrics, abs_sec


def build_channel_stats(records, duration):
    stats = {}
    active = defaultdict(list)
    intervals = defaultdict(list)

    for rec in records:
        msg, sec = rec["msg"], rec["sec"]
        if not hasattr(msg, "channel"):
            continue
        ch = msg.channel
        s = stats.setdefault(ch, {
            "channel": ch, "program": None, "programs": [], "onsets": [],
            "velocities": [], "pitch_bends": 0, "controls": 0,
        })
        if msg.type == "program_change":
            s["program"] = msg.program
            s["programs"].append((sec, msg.program))
        elif msg.type == "note_on" and msg.velocity > 0:
            s["onsets"].append((sec, msg.note, msg.velocity))
            s["velocities"].append(msg.velocity)
            active[(ch, msg.note)].append((sec, msg.velocity))
        elif msg.type in ("note_off", "note_on") and (msg.type == "note_off" or msg.velocity == 0):
            stack = active.get((ch, msg.note))
            if stack:
                start, vel = stack.pop(0)
                intervals[ch].append((start, sec, msg.note, vel))
        elif msg.type == "pitchwheel":
            s["pitch_bends"] += 1
        elif msg.type == "control_change":
            s["controls"] += 1

    for (ch, note), stack in active.items():
        for start, vel in stack:
            intervals[ch].append((start, duration, note, vel))

    for ch, s in stats.items():
        iv = intervals.get(ch, [])
        s["intervals"] = iv
        notes = [n for _, n, _ in s["onsets"]]
        s["note_count"] = len(notes)
        s["median_note"] = statistics.median(notes) if notes else None
        s["mean_velocity"] = statistics.mean(s["velocities"]) if s["velocities"] else 0
        s["first_note"] = s["onsets"][0][0] if s["onsets"] else None
        s["last_note"] = s["onsets"][-1][0] if s["onsets"] else None

        endpoints = []
        for a, b, _, _ in iv:
            if b > a:
                endpoints.append((a, 1))
                endpoints.append((b, -1))
        endpoints.sort(key=lambda x: (x[0], x[1]))
        active_n = 0
        prev = None
        union = mono = 0.0
        for t, delta in endpoints:
            if prev is not None and t > prev and active_n > 0:
                union += t - prev
                if active_n == 1:
                    mono += t - prev
            active_n += delta
            prev = t
        s["active_seconds"] = union
        s["monophony"] = (mono / union) if union > 0 else 0.0
        if s["program"] is None and ch != 9:
            s["program"] = s["programs"][0][1] if s["programs"] else 0
    return stats


def lyric_alignment(stat, lyric_times):
    if not lyric_times or not stat["onsets"]:
        return 0.0
    onsets = [x[0] for x in stat["onsets"]]
    hits = 0
    for t in lyric_times:
        i = bisect.bisect_left(onsets, t)
        distances = []
        if i < len(onsets):
            distances.append(abs(onsets[i] - t))
        if i:
            distances.append(abs(onsets[i - 1] - t))
        if distances and min(distances) <= 0.24:
            hits += 1
    return hits / len(lyric_times)


def choose_roles(stats, lyrics):
    channels = [s for s in stats.values() if s["note_count"] >= 3]
    if not channels:
        raise RuntimeError("O MIDI não contém canais com notas suficientes.")

    drums = stats.get(9)
    if not drums or drums["note_count"] < 3:
        drums = max(channels, key=lambda s: s["note_count"] if s["channel"] == 9 else 0)

    candidates = [s for s in channels if s["channel"] != drums["channel"]]
    bass_scores = []
    for s in candidates:
        p = s["program"] or 0
        family = 1.0 if 32 <= p <= 39 else 0.0
        med = s["median_note"] if s["median_note"] is not None else 60
        low = max(0.0, min(1.0, (55 - med) / 22))
        activity = min(1.0, s["active_seconds"] / 60.0)
        bass_scores.append((4.0 * family + 1.4 * low + 0.7 * activity, s))
    bass_score, bass = max(bass_scores, key=lambda x: x[0])

    lyric_times = [t for t, _ in lyrics]
    melody_scores = []
    for s in candidates:
        if s["channel"] == bass["channel"]:
            continue
        p = s["program"] or 0
        family_bonus = 1.0 if 80 <= p <= 87 else 0.72 if (52 <= p <= 54 or 72 <= p <= 79) else 0.18
        align = lyric_alignment(s, lyric_times)
        med = s["median_note"] if s["median_note"] is not None else 60
        range_bonus = 1.0 if 55 <= med <= 82 else 0.45
        note_bonus = min(1.0, s["note_count"] / 160.0)
        first_lyric = lyric_times[0] if lyric_times else None
        start_bonus = 0.0
        if first_lyric is not None and s["first_note"] is not None:
            start_bonus = max(0.0, 1.0 - abs(s["first_note"] - first_lyric) / 2.0)
        score = 4.5 * align + 2.0 * s["monophony"] + 1.5 * family_bonus + 0.7 * range_bonus + 0.5 * note_bonus + 1.0 * start_bonus
        melody_scores.append((score, s, align))
    if not melody_scores:
        raise RuntimeError("Não encontrei uma pista candidata a melodia.")
    melody_score, melody, melody_align = max(melody_scores, key=lambda x: x[0])

    bass_conf = max(55, min(99, round(58 + bass_score * 8)))
    melody_conf = max(55, min(99, round(52 + melody_score * 5)))
    return drums, bass, melody, bass_conf, melody_conf, melody_align


def count_window(stat, start, end):
    notes = [x for x in stat["onsets"] if start <= x[0] < end]
    overlap = 0.0
    for a, b, _, _ in stat["intervals"]:
        overlap += max(0.0, min(end, b) - max(start, a))
    return len(notes), min(end - start, overlap)


def choose_clip(stats, lyrics, duration, drums, bass, melody, manual=None):
    max_start = max(0.0, duration - CLIP_SECONDS)
    if manual is not None:
        return round(max(0.0, min(max_start, manual)), 2)

    accompaniment = [
        s for s in stats.values()
        if s["note_count"] >= 3 and s["channel"] not in {drums["channel"], bass["channel"], melody["channel"]}
    ]
    lyric_times = [t for t, _ in lyrics]
    starts = []
    x = 0.0
    while x <= max_start + 1e-9:
        starts.append(x)
        x += 0.5

    best = (float("-inf"), 0.0)
    for start in starts:
        end = start + CLIP_SECONDS
        d_n, _ = count_window(drums, start, end)
        b_n, _ = count_window(bass, start, end)
        m_n, m_a = count_window(melody, start, end)
        lyric_n = sum(1 for t in lyric_times if start <= t < end)
        accomp_active = 0
        accomp_notes = 0
        for s in accompaniment:
            n, a = count_window(s, start, end)
            if n >= 2 or a >= 2.0:
                accomp_active += 1
                accomp_notes += n
        score = (
            min(d_n / 45.0, 1.0) * 2.1 +
            min(b_n / 16.0, 1.0) * 1.7 +
            min(m_n / 18.0, 1.0) * 3.2 +
            min(lyric_n / 18.0, 1.0) * 2.4 +
            min(accomp_active / 4.0, 1.0) * 1.8 +
            min(accomp_notes / 70.0, 1.0) * 0.8 +
            min(m_a / 10.0, 1.0) * 0.8
        )
        if d_n >= 8 and b_n >= 4 and m_n >= 5:
            score += 2.0
        center = start + CLIP_SECONDS / 2
        score += min(center, max(0.0, duration - center)) / max(duration, 1.0) * 0.12
        if score > best[0]:
            best = (score, start)
    return round(best[1], 2)


def local_accompaniment_score(stat, start, end):
    n, active = count_window(stat, start, end)
    if n < 2 and active < 1.0:
        return -1
    family = family_for_program(stat["program"] or 0)
    useful = 0.35 if family not in {"Efeito", "Percussão"} else 0.0
    return min(n / 35.0, 1.4) + min(active / CLIP_SECONDS, 1.0) * 1.6 + stat["mean_velocity"] / 127.0 * 0.45 + useful


def numbered_names(channels):
    base = []
    counts = defaultdict(int)
    totals = defaultdict(int)
    for s in channels:
        name = "Bateria" if s["channel"] == 9 else program_name(s["program"] or 0)
        base.append(name)
        totals[name] += 1
    result = {}
    for s, name in zip(channels, base):
        counts[name] += 1
        result[s["channel"]] = f"{name} {counts[name]}" if totals[name] > 1 else name
    return result


def choose_groups(stats, drums, bass, melody, start):
    end = start + CLIP_SECONDS
    candidates = [
        s for s in stats.values()
        if s["note_count"] >= 3 and s["channel"] not in {drums["channel"], bass["channel"], melody["channel"]}
    ]
    scored = [(local_accompaniment_score(s, start, end), s) for s in candidates]
    scored = [(score, s) for score, s in scored if score >= 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    if len(scored) >= 4:
        group1 = [s for _, s in scored[:2]]
        group2 = [s for _, s in scored[2:4]]
    elif len(scored) == 3:
        group1 = [s for _, s in scored[:2]]
        group2 = [scored[2][1]]
    elif len(scored) == 2:
        group1 = [scored[0][1]]
        group2 = [scored[1][1]]
    elif len(scored) == 1:
        group1 = [scored[0][1]]
        group2 = []
    else:
        group1 = []
        group2 = []
    active_all = []
    for s in stats.values():
        n, a = count_window(s, start, end)
        if n >= 1 or a >= 0.5:
            active_all.append(s)
    active_all.sort(key=lambda s: s["channel"])
    return group1, group2, active_all


def slice_midi(mid, records, selected_channels, start, duration, out_path, melody_channel=None, melody_program=None):
    end = start + duration
    out = mido.MidiFile(type=0, ticks_per_beat=480)
    track = mido.MidiTrack()
    out.tracks.append(track)
    fixed_tempo = 500000
    events = [(0, 0, mido.MetaMessage("set_tempo", tempo=fixed_tempo, time=0))]
    programs = {}
    controls = defaultdict(dict)
    pitch = defaultdict(int)
    active = defaultdict(list)

    for rec in records:
        sec, msg = rec["sec"], rec["msg"]
        if sec >= start:
            break
        if not hasattr(msg, "channel") or msg.channel not in selected_channels:
            continue
        ch = msg.channel
        if msg.type == "program_change":
            programs[ch] = msg.program
        elif msg.type == "control_change":
            controls[ch][msg.control] = msg.value
        elif msg.type == "pitchwheel":
            pitch[ch] = msg.pitch
        elif msg.type == "note_on" and msg.velocity > 0:
            active[(ch, msg.note)].append(msg.velocity)
        elif msg.type in ("note_off", "note_on") and (msg.type == "note_off" or msg.velocity == 0):
            stack = active.get((ch, msg.note))
            if stack:
                stack.pop(0)

    for ch in sorted(selected_channels):
        if ch != 9:
            program = melody_program if ch == melody_channel and melody_program is not None else programs.get(ch, 0)
            events.append((0, 1, mido.Message("program_change", channel=ch, program=int(program), time=0)))
        had_volume = False
        for ctl, value in sorted(controls[ch].items()):
            if ctl in {0, 32}:
                continue
            if ch != melody_channel and ctl in {7, 11}:
                value = max(1, min(127, round(value * INSTRUMENT_VOLUME_SCALE)))
            if ctl == 7:
                had_volume = True
            events.append((0, 2, mido.Message("control_change", channel=ch, control=ctl, value=value, time=0)))
        if ch == melody_channel:
            events.append((0, 2, mido.Message("control_change", channel=ch, control=7, value=MELODY_VOLUME, time=0)))
            events.append((0, 2, mido.Message("control_change", channel=ch, control=11, value=MELODY_EXPRESSION, time=0)))
        elif not had_volume:
            events.append((0, 2, mido.Message("control_change", channel=ch, control=7, value=round(100 * INSTRUMENT_VOLUME_SCALE), time=0)))
        if pitch[ch]:
            events.append((0, 2, mido.Message("pitchwheel", channel=ch, pitch=pitch[ch], time=0)))

    output_active = defaultdict(int)
    for (ch, note), velocities in active.items():
        if ch in selected_channels:
            for vel in velocities:
                events.append((0, 4, mido.Message("note_on", channel=ch, note=note, velocity=vel, time=0)))
                output_active[(ch, note)] += 1

    def sec_to_tick(relative_sec):
        return max(0, int(round(mido.second2tick(relative_sec, out.ticks_per_beat, fixed_tempo))))

    for rec in records:
        sec, msg = rec["sec"], rec["msg"]
        if sec < start:
            continue
        if sec >= end:
            break
        if not hasattr(msg, "channel") or msg.channel not in selected_channels:
            continue
        if msg.type not in {"note_on", "note_off", "control_change", "pitchwheel", "aftertouch", "polytouch", "program_change"}:
            continue
        ch = msg.channel
        if msg.type == "program_change" and ch == melody_channel:
            continue
        tick = sec_to_tick(sec - start)
        copy = msg.copy(time=0)
        if msg.type == "control_change" and ch != melody_channel and msg.control in {7, 11}:
            copy = msg.copy(value=max(1, min(127, round(msg.value * INSTRUMENT_VOLUME_SCALE))), time=0)
        priority = 4
        if msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
            priority = 3
            if output_active[(ch, msg.note)] > 0:
                output_active[(ch, msg.note)] -= 1
        elif msg.type == "note_on":
            output_active[(ch, msg.note)] += 1
        elif msg.type in {"program_change", "control_change", "pitchwheel"}:
            priority = 2
        events.append((tick, priority, copy))

    end_tick = sec_to_tick(duration)
    for (ch, note), count in output_active.items():
        for _ in range(max(0, count)):
            events.append((end_tick, 8, mido.Message("note_off", channel=ch, note=note, velocity=0, time=0)))
    events.append((end_tick, 9, mido.MetaMessage("end_of_track", time=0)))
    events.sort(key=lambda x: (x[0], x[1]))

    prev_tick = 0
    for tick, _, msg in events:
        delta = max(0, tick - prev_tick)
        track.append(msg.copy(time=delta))
        prev_tick = tick
    out.save(out_path)


def render_round(mid, records, channels, start, out_path, soundfont, melody_channel, melody_program):
    with tempfile.TemporaryDirectory(prefix="mdd-midi-round-") as td:
        td = Path(td)
        sliced = td / "slice.mid"
        wav = td / "render.wav"
        slice_midi(mid, records, set(channels), start, CLIP_SECONDS, sliced, melody_channel, melody_program)
        run(["fluidsynth", "-ni", "-g", "0.82", "-F", wav, "-r", "44100", soundfont, sliced])
        run([
            "ffmpeg", "-y", "-v", "error", "-i", wav, "-t", f"{CLIP_SECONDS:.3f}",
            "-af", "alimiter=limit=0.96", "-c:a", "libvorbis", "-q:a", "5", out_path,
        ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--source-path", default="")
    ap.add_argument("--melody-style", default="bandle")
    ap.add_argument("--clip-start", default="")
    ap.add_argument("--soundfont", default=os.environ.get("SOUNDFONT_PATH", ""))
    ap.add_argument("--reveal-audio", default="")
    ap.add_argument("--reveal-source-path", default="")
    args = ap.parse_args()

    source = Path(args.file).resolve()
    if not source.exists():
        raise SystemExit(f"MIDI não encontrado: {source}")
    style_id = args.melody_style if args.melody_style in MELODY_STYLES else "bandle"
    style = MELODY_STYLES[style_id]
    soundfont = Path(args.soundfont)
    if not soundfont.exists():
        raise SystemExit(f"SoundFont não encontrado: {soundfont}")

    mid = mido.MidiFile(source)
    records, lyrics, duration = build_timeline(mid)
    stats = build_channel_stats(records, duration)
    drums, bass, melody, bass_conf, melody_conf, melody_align = choose_roles(stats, lyrics)

    manual = None
    if str(args.clip_start).strip():
        manual = float(str(args.clip_start).replace(",", "."))
    clip_start = choose_clip(stats, lyrics, duration, drums, bass, melody, manual)
    group1, group2, active_all = choose_groups(stats, drums, bass, melody, clip_start)

    name_overrides = {}
    try:
        previous_manifest_path = OUT_DIR / "manifest.json"
        if previous_manifest_path.exists():
            previous_manifest = json.loads(previous_manifest_path.read_text(encoding="utf-8"))
            if str(previous_manifest.get("sourcePath", "")) == str(args.source_path or source.name):
                raw_overrides = previous_manifest.get("nameOverrides") or {}
                if isinstance(raw_overrides, dict):
                    name_overrides = {
                        str(k): str(v).strip()[:60]
                        for k, v in raw_overrides.items()
                        if str(v).strip()
                    }
    except Exception as exc:
        print(f"Aviso: não consegui reaproveitar nomes personalizados: {exc}")

    names = numbered_names(active_all)
    names[drums["channel"]] = "Bateria"
    names[bass["channel"]] = names.get(bass["channel"], "Baixo")
    names[melody["channel"]] = "Melodia da voz"
    for ch in list(names):
        custom = name_overrides.get(str(ch))
        if custom:
            names[ch] = custom

    cumulative = []
    rounds = []

    def add_round(label, added):
        for s in added:
            if s["channel"] not in cumulative:
                cumulative.append(s["channel"])
        rounds.append({
            "number": len(rounds) + 1,
            "label": label,
            "addedChannels": [s["channel"] for s in added],
            "added": [names.get(s["channel"], f"Canal {s['channel'] + 1}") for s in added],
            "channels": list(cumulative),
        })

    add_round("Bateria", [drums])
    add_round("+ Baixo", [bass])
    add_round("+ Instrumentos 1", group1)
    add_round("+ Instrumentos 2", group2)
    add_round("+ Melodia", [melody])

    full_channels = [s["channel"] for s in active_all]
    rounds.append({
        "number": 6, "label": "Revelação", "addedChannels": full_channels,
        "added": [names.get(ch, f"Canal {ch + 1}") for ch in full_channels],
        "channels": full_channels,
    })

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"MIDI: {source.name}")
    print(f"Duração: {duration:.2f}s | trecho: {clip_start:.2f}s–{clip_start + CLIP_SECONDS:.2f}s")
    print(f"Bateria: canal {drums['channel'] + 1}")
    print(f"Baixo: canal {bass['channel'] + 1} ({program_name(bass['program'] or 0)})")
    print(f"Melodia: canal {melody['channel'] + 1} ({program_name(melody['program'] or 0)}) | lyric align={melody_align:.2f}")
    print("Grupo 1:", [names.get(s["channel"]) for s in group1])
    print("Grupo 2:", [names.get(s["channel"]) for s in group2])

    reveal_audio = Path(args.reveal_audio).resolve() if str(args.reveal_audio).strip() else None

    for item in rounds:
        out = OUT_DIR / f"round-{item['number']}.ogg"
        if item["number"] == 6 and reveal_audio and reveal_audio.exists():
            run([
                "ffmpeg", "-y", "-v", "error",
                "-ss", f"{clip_start:.3f}", "-i", reveal_audio,
                "-t", f"{CLIP_SECONDS:.3f}",
                "-af", "alimiter=limit=0.96",
                "-c:a", "libvorbis", "-q:a", "5", out,
            ])
        else:
            render_round(mid, records, item["channels"], clip_start, out, soundfont, melody["channel"], style["program"])
        item["audio"] = f"midi-lab/round-{item['number']}.ogg"

    channel_rows = []
    for ch in sorted(stats):
        s = stats[ch]
        if s["note_count"] < 1:
            continue
        n, active = count_window(s, clip_start, clip_start + CLIP_SECONDS)
        channel_rows.append({
            "channel": ch,
            "name": names.get(ch, "Bateria" if ch == 9 else program_name(s["program"] or 0)),
            "program": s["program"],
            "family": "Bateria" if ch == 9 else family_for_program(s["program"] or 0),
            "notes": s["note_count"],
            "notesInClip": n,
            "activeInClip": round(active, 2),
            "monophony": round(s["monophony"], 3),
            "pitchBends": s["pitch_bends"],
        })

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceName": source.name,
        "sourcePath": args.source_path or source.name,
        "revealSourcePath": args.reveal_source_path or "",
        "revealMode": "original-audio" if reveal_audio and reveal_audio.exists() else "midi",
        "duration": round(duration, 2),
        "clipStart": round(clip_start, 2),
        "clipSeconds": CLIP_SECONDS,
        "midiType": mid.type,
        "ticksPerBeat": mid.ticks_per_beat,
        "melodyStyle": style_id,
        "melodyStyleName": style["name"],
        "nameOverrides": name_overrides,
        "roles": {
            "drums": {"channel": drums["channel"], "name": names.get(drums["channel"], "Bateria"), "confidence": 99 if drums["channel"] == 9 else 78},
            "bass": {"channel": bass["channel"], "name": names.get(bass["channel"], "Baixo"), "confidence": bass_conf},
            "melody": {
                "channel": melody["channel"], "name": names.get(melody["channel"], "Melodia da voz"),
                "sourceInstrument": program_name(melody["program"] or 0),
                "confidence": melody_conf, "lyricAlignment": round(melody_align, 3),
            },
        },
        "groups": {
            "instrument1": [names.get(s["channel"], f"Canal {s['channel'] + 1}") for s in group1],
            "instrument2": [names.get(s["channel"], f"Canal {s['channel'] + 1}") for s in group2],
        },
        "rounds": rounds,
        "channels": channel_rows,
        "lyricsDetected": len(lyrics),
        "availableMelodyStyles": [{"id": k, "name": v["name"]} for k, v in MELODY_STYLES.items()],
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
