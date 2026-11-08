"""Builds the final walkthrough from the presenter's own recordings.

Inputs (in submission/):
  intro.*                     camera intro, any orientation
  work/voice-clean.wav        narration (see align-voice.py), cleaned
  work/voice-lines.json       [[start, end], ...] seconds per script line
  walkthrough-silent.mp4      screen demo, and cues.json with scene start times
Output: submission/final-walkthrough.mp4

The presenter's voice drives the timing: each scene holds its last frame until
that line has been spoken. Long pauses inside a line are shortened.
Usage: python -I scripts/build-final-video.py
"""
import json
import os
import re
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SUB = os.path.join(ROOT, "submission")
WORK = os.path.join(SUB, "work")
PARTS = os.path.join(WORK, "parts")
FFMPEG = subprocess.run(["node", "-e", "console.log(require('ffmpeg-static'))"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
W, H, FPS = 1440, 900, 25
TEMPO = 1.06
GAP = 0.32
FONT = "C\\:/Windows/Fonts/segoeui.ttf"
FONT_BOLD = "C\\:/Windows/Fonts/segoeuib.ttf"

# Presence and steadiness for speech: rumble cut, gentle compression, a little clarity, even loudness.
VOICE = (
    "highpass=f=85,lowpass=f=11500,afftdn=nf=-24,"
    "equalizer=f=200:t=q:w=1.2:g=-1.5,equalizer=f=3200:t=q:w=1.0:g=2.5,"
    "acompressor=threshold=-21dB:ratio=3:attack=8:release=120:makeup=2,"
    "loudnorm=I=-16:TP=-1.5:LRA=9"
)


def ff(*args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def speech_chunks(src, start, end):
    out = subprocess.run(
        [FFMPEG, "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", src, "-af", "silencedetect=noise=-38dB:d=0.45", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    length = end - start
    chunks, cursor = [], 0.0
    for i, s in enumerate(starts):
        if s - cursor > 0.12:
            chunks.append((max(0, cursor - 0.06), min(length, s + 0.1)))
        cursor = ends[i] if i < len(ends) else length
    if length - cursor > 0.12:
        chunks.append((max(0, cursor - 0.06), length))
    return [(start + a, start + b) for a, b in chunks]


def line_audio(src, start, end, out):
    chunks = speech_chunks(src, start, end)
    inputs, filters = [], []
    for i, (a, b) in enumerate(chunks):
        filters.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={max(0, b - a - 0.03):.3f}:d=0.03[c{i}]")
    gaps = [f"aevalsrc=0:d={GAP}:s=48000[g{i}]" for i in range(len(chunks) - 1)]
    order = "".join(f"[c{i}]" + (f"[g{i}]" if i < len(chunks) - 1 else "") for i in range(len(chunks)))
    n = len(chunks) * 2 - 1
    graph = ";".join(filters + gaps + [f"{order}concat=n={n}:v=0:a=1,atempo={TEMPO}[a]"])
    ff("-i", src, "-filter_complex", graph, "-map", "[a]", "-ar", "48000", "-ac", "1", out)
    return duration(out)


def build_intro(intro, out):
    title = "drawtext=fontfile='{f}':text='{t}':fontcolor=white:fontsize={s}:x=80:y={y}:alpha='if(lt(t,0.8),0,if(lt(t,1.4),(t-0.8)/0.6,1))'"
    lower = ",".join([
        "drawbox=x=56:y=ih-210:w=620:h=150:color=0x14594f@0.88:t=fill:enable='gte(t,0.8)'",
        title.format(f=FONT_BOLD, t="Om Umaraliya", s=46, y="h-192"),
        title.format(f=FONT, t="Full-stack developer   ·   Hive Inspect FDE assignment", s=24, y="h-122"),
    ])
    graph = (
        f"[0:v]split[a][b];"
        f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,eq=brightness=-0.12:saturation=0.8[bg];"
        f"[b]scale=-2:{H - 60},eq=contrast=1.05:saturation=1.08:brightness=0.02,unsharp=5:5:0.6[fg];"
        f"[bg][fg]overlay=(W-w)/2+180:(H-h)/2,fps={FPS},{lower},fade=t=in:d=0.6,format=yuv420p[v];"
        f"[0:a]{VOICE},aresample=48000[a2]"
    )
    ff("-i", intro, "-filter_complex", graph, "-map", "[v]", "-map", "[a2]", "-ac", "1",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", out)


def main():
    intro = next(os.path.join(SUB, f) for f in os.listdir(SUB) if f.lower().startswith("intro."))
    cues = json.load(open(os.path.join(SUB, "cues.json"), encoding="utf-8"))
    lines = json.load(open(os.path.join(WORK, "voice-lines.json")))
    assert len(cues) == len(lines), (len(cues), len(lines))
    silent = os.path.join(SUB, "walkthrough-silent.mp4")
    total = duration(silent)
    shutil.rmtree(PARTS, ignore_errors=True)
    os.makedirs(PARTS)

    build_intro(intro, os.path.join(PARTS, "000-intro.mp4"))

    src = os.path.join(WORK, "voice-clean.wav")
    report = []
    for i, cue in enumerate(cues):
        scene_start = 0.0 if i == 0 else cue["atMs"] / 1000
        scene_end = cues[i + 1]["atMs"] / 1000 if i + 1 < len(cues) else total
        audio = os.path.join(PARTS, f"{i + 1:03d}.wav")
        spoken = line_audio(src, lines[i][0], lines[i][1], audio)
        scene = scene_end - scene_start
        lead = 0.25
        length = max(scene, spoken + lead + 0.55)
        if i == len(cues) - 1:
            length = spoken + lead + 1.8  # end on the closing card, without dead air
        hold = max(0.0, length - scene)
        ff(
            "-ss", f"{scene_start:.3f}", "-to", f"{scene_end:.3f}", "-i", silent, "-i", audio,
            "-filter_complex",
            f"[0:v]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={hold:.3f},fps={FPS},format=yuv420p[v];"
            f"[1:a]adelay={int(lead * 1000)}|{int(lead * 1000)},{VOICE.split(',loudnorm')[0]},apad=whole_dur={length:.3f}[a]",
            "-map", "[v]", "-map", "[a]", "-t", f"{length:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "1",
            os.path.join(PARTS, f"{i + 1:03d}.mp4"),
        )
        report.append((i + 1, scene, spoken, hold))

    listing = os.path.join(PARTS, "list.txt")
    with open(listing, "w") as f:
        for name in sorted(n for n in os.listdir(PARTS) if n.endswith(".mp4")):
            f.write(f"file '{os.path.join(PARTS, name).replace(os.sep, '/')}'\n")
    joined = os.path.join(WORK, "joined.mp4")
    ff("-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", joined)
    final = os.path.join(SUB, "final-walkthrough.mp4")
    ff("-i", joined, "-af", "loudnorm=I=-16:TP=-1.5:LRA=9", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", final)
    for n, scene, spoken, hold in report:
        print(f"line {n:02d}: scene {scene:5.1f}s  voice {spoken:5.1f}s  held {hold:4.1f}s")
    print(f"Saved {final} ({duration(final) / 60:.1f} minutes)")


if __name__ == "__main__":
    main()
