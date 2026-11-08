// Builds the final walkthrough from the presenter's own recordings:
//   submission/intro.*  camera clip (face and voice), any common video format
//   submission/voice.*  one audio file reading submission/NARRATION.txt in order
// plus submission/walkthrough-silent.mp4 and cues.json from record-demo.ts.
// Usage: npx tsx scripts/make-final-video.ts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const FFMPEG = ffmpeg as unknown as string;
const DIR = path.resolve("submission");
const WORK = path.join(DIR, "work");
const OUT = path.join(DIR, "final-walkthrough.mp4");
const W = 1440;
const H = 900;

type Cue = { atMs: number; slotMs: number; text: string };

const run = (args: string[]) => execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const find = (base: string) => readdirSync(DIR).find((f) => f.toLowerCase().startsWith(`${base}.`));

function seconds(file: string) {
  const out = spawnSync(FFMPEG, ["-i", file], { encoding: "utf8" }).stderr;
  const [, h, m, s] = out.match(/Duration: (\d+):(\d+):([\d.]+)/) ?? [];
  return (Number(h) * 60 + Number(m)) * 60 + Number(s);
}

// Cleans a speech recording: removes rumble and hiss, then evens out loudness.
const VOICE_FILTER = "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11";

function speechSegments(file: string): [number, number][] {
  const out = spawnSync(FFMPEG, ["-i", file, "-af", "silencedetect=noise=-35dB:d=1.2", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const total = seconds(file);
  const segments: [number, number][] = [];
  let cursor = 0;
  starts.forEach((start, i) => {
    if (start - cursor > 0.4) segments.push([cursor, start]);
    cursor = ends[i] ?? total;
  });
  if (total - cursor > 0.4) segments.push([cursor, total]);
  return segments;
}

function main() {
  const intro = find("intro");
  const voice = find("voice");
  const silent = path.join(DIR, "walkthrough-silent.mp4");
  if (!intro || !existsSync(silent)) throw new Error("Need submission/intro.* and submission/walkthrough-silent.mp4.");
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  // 1. Intro: same frame size, frame rate and audio format as the demo.
  const introOut = path.join(WORK, "intro.mp4");
  run([
    "-i", path.join(DIR, intro),
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x14594f,fps=25,format=yuv420p`,
    "-af", `${VOICE_FILTER},aresample=48000`, "-ac", "1",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "160k", introOut,
  ]);

  // 2. Demo: the presenter's voice placed on each scene, or the existing narrated demo as a fallback.
  let demo = path.join(DIR, "walkthrough-demo.mp4");
  if (voice) {
    const cues: Cue[] = JSON.parse(readFileSync(path.join(DIR, "cues.json"), "utf8"));
    const clean = path.join(WORK, "voice.wav");
    run(["-i", path.join(DIR, voice), "-af", VOICE_FILTER, "-ar", "48000", "-ac", "1", clean]);
    // --drop=4,9 removes retaken lines (1-based, in order of speaking).
    const drop = new Set((process.argv.find((x) => x.startsWith("--drop="))?.slice(7) ?? "").split(",").filter(Boolean).map(Number));
    const segments = speechSegments(clean).filter((_, i) => !drop.has(i + 1));
    if (segments.length !== cues.length) {
      console.error(`Found ${segments.length} spoken lines, expected ${cues.length}. Durations:`);
      segments.forEach(([a, b], i) => console.error(`  ${i + 1}: ${(b - a).toFixed(1)}s at ${a.toFixed(1)}s`));
      process.exit(1);
    }
    const parts = cues.map((cue, i) => {
      const [start, end] = segments[i];
      const length = end - start + 0.25;
      const fit = (cue.slotMs - 200) / 1000;
      const tempo = length > fit ? Math.min(length / fit, 1.25) : 1;
      return `[1:a]atrim=${Math.max(0, start - 0.1).toFixed(3)}:${(end + 0.15).toFixed(3)},asetpts=PTS-STARTPTS,atempo=${tempo.toFixed(3)},adelay=${cue.atMs}|${cue.atMs}[v${i}]`;
    });
    const mix = `${cues.map((_, i) => `[v${i}]`).join("")}amix=inputs=${cues.length}:normalize=0[voice]`;
    demo = path.join(WORK, "demo.mp4");
    run([
      "-i", silent, "-i", clean, "-filter_complex", `${parts.join(";")};${mix}`,
      "-map", "0:v", "-map", "[voice]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "1", demo,
    ]);
  }

  // 3. Join intro and demo.
  run([
    "-i", introOut, "-i", demo,
    "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT,
  ]);
  rmSync(WORK, { recursive: true, force: true });
  console.log(`Saved ${OUT} (${(seconds(OUT) / 60).toFixed(1)} minutes)${voice ? "" : " using the AI-narrated demo"}`);
}

main();
