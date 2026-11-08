"""Matches a narration recording to the script lines in submission/cues.json.

Speech is cut at silences, each piece is transcribed offline (scripts/transcribe.ps1),
then a dynamic program assigns pieces to lines in order, allowing retakes to be dropped.
Writes submission/work/voice-lines.json: [[start, end], ...] in seconds, one per line.
Usage: python -I scripts/align-voice.py
"""
import json
import os
import re
import subprocess
import sys
from difflib import SequenceMatcher

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORK = os.path.join(ROOT, "submission", "work")
FFMPEG = subprocess.run(["node", "-e", "console.log(require('ffmpeg-static'))"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
CLEAN = os.path.join(WORK, "voice-clean.wav")
SEGDIR = os.path.join(WORK, "segments")


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower().replace("-", " "))


def segments():
    out = subprocess.run([FFMPEG, "-i", CLEAN, "-af", "silencedetect=noise=-35dB:d=1.0", "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    total = float(re.search(r"time=(\d+):(\d+):([\d.]+)", out.split("\n")[-2] if "time=" in out.split("\n")[-2] else out).groups()[2]) if False else None
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    total = int(dur[0]) * 3600 + int(dur[1]) * 60 + float(dur[2])
    segs, cursor = [], 0.0
    for i, s in enumerate(starts):
        if s - cursor > 0.3:
            segs.append((cursor, s))
        cursor = ends[i] if i < len(ends) else total
    if total - cursor > 0.3:
        segs.append((cursor, total))
    return segs


def similarity(heard, expected):
    h, e = words(heard), words(expected)
    if not h or not e:
        return 0.0
    matcher = SequenceMatcher(None, h, e, autojunk=False)
    matched = sum(b.size for b in matcher.get_matching_blocks())
    recall = matched / len(e)
    precision = matched / len(h)
    # Character-level similarity rescues misheard words ("temblor" for "template").
    chars = SequenceMatcher(None, " ".join(h), " ".join(e), autojunk=False).ratio()
    length = min(len(h), len(e)) / max(len(h), len(e))
    return 0.35 * recall + 0.15 * precision + 0.3 * chars + 0.2 * length


def main():
    cues = json.load(open(os.path.join(ROOT, "submission", "cues.json"), encoding="utf-8"))
    lines = [c["text"] for c in cues]
    segs = segments()
    os.makedirs(SEGDIR, exist_ok=True)
    for f in os.listdir(SEGDIR):
        os.remove(os.path.join(SEGDIR, f))
    for i, (a, b) in enumerate(segs):
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", CLEAN, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", os.path.join(SEGDIR, f"{i:03d}.wav")], check=True)
    out_tsv = os.path.join(WORK, "segments.tsv")
    env = dict(os.environ, STT_DIR=SEGDIR, STT_OUT=out_tsv)
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ROOT, "scripts", "transcribe.ps1")], env=env, check=True)
    heard = {}
    for row in open(out_tsv, encoding="utf-8-sig").read().splitlines():
        name, _, text = row.partition("\t")
        heard[int(name.split(".")[0])] = text

    S, L = len(segs), len(lines)
    SKIP = 0.35
    NEG = -1e9
    # best[j][b]: best score with lines[:j] placed and the last used segment index b-1.
    best = [[NEG] * (S + 1) for _ in range(L + 1)]
    back = [[None] * (S + 1) for _ in range(L + 1)]
    best[0] = [-SKIP * k for k in range(S + 1)]
    for j in range(1, L + 1):
        for b in range(1, S + 1):
            text = ""
            for a in range(b - 1, max(-1, b - 9), -1):
                text = (heard.get(a, "") + " " + text).strip()
                score = similarity(text, lines[j - 1])
                for k in range(a, -1, -1):
                    if best[j - 1][k] == NEG:
                        continue
                    total = best[j - 1][k] - SKIP * (a - k) + score
                    if total > best[j][b]:
                        best[j][b] = total
                        back[j][b] = (k, a)
    b = max(range(S + 1), key=lambda x: best[L][x] - SKIP * (S - x))
    spans = []
    for j in range(L, 0, -1):
        k, a = back[j][b]
        spans.append((a, b - 1))
        b = k
    spans.reverse()
    result = []
    for j, (a, z) in enumerate(spans):
        start, end = segs[a][0], segs[z][1]
        result.append([round(start, 3), round(end, 3)])
        print(f"{j + 1:02d} segs {a + 1:>2}-{z + 1:<2} {start:6.1f}-{end:6.1f} ({end - start:4.1f}s)  heard: {' '.join(heard.get(i, '') for i in range(a, z + 1))[:70]}")
    used = {i for a, z in spans for i in range(a, z + 1)}
    skipped = [i + 1 for i in range(S) if i not in used]
    print("skipped segments:", skipped)
    json.dump(result, open(os.path.join(WORK, "voice-lines.json"), "w"))


if __name__ == "__main__":
    sys.exit(main())
