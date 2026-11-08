// Records a captioned, narrated product walkthrough against a running local
// server. Narration uses Windows' built-in speech voice (scripts/tts.ps1).
// Usage: start the app on DEMO_URL, then `npx tsx scripts/record-demo.ts`.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import ffmpeg from "ffmpeg-static";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(".playwright");
const BASE = process.env.DEMO_URL ?? "http://localhost:3200";
const OUT = path.resolve("submission");
const RAW = path.join(OUT, "raw");
const SAMPLE = path.resolve("samples", "InterNACHI-Residential-2026-11-06.xls");
const SIZE = { width: 1440, height: 900 };
const VOICE = path.join(OUT, "voice");
const FFMPEG = ffmpeg as unknown as string;

type Cue = { file: string; atMs: number; slotMs: number; text: string };
const cues: Cue[] = [];
let startedAt = 0;

function durationMs(file: string) {
  const probe = spawnSync(FFMPEG, ["-i", file], { encoding: "utf8" }).stderr;
  const [, h, m, sec] = probe.match(/Duration: (\d+):(\d+):([\d.]+)/) ?? [];
  return Math.round(((Number(h) * 60 + Number(m)) * 60 + Number(sec)) * 1000);
}

function speechFile(text: string, index = cues.length): { file: string; ms: number } {
  const file = path.join(VOICE, `${String(index).padStart(2, "0")}.wav`);
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve("scripts", "tts.ps1")], {
    env: { ...process.env, TTS_TEXT: text, TTS_OUT: file },
    stdio: "ignore",
  });
  return { file, ms: durationMs(file) };
}

const PAUSE_LIMIT_MS = 6000;
const PAUSE_KEEP_MS = 1500;

// Slow page loads leave long silent stretches. Cut them, keeping a short beat
// either side, and shift later cues to match.
function cutPauses(totalMs: number) {
  const keep: [number, number][] = [];
  const shifted: Cue[] = [];
  let cursor = 0;
  let previousEnd = 0;
  let removed = 0;
  for (const cue of cues) {
    if (cue.atMs - previousEnd > PAUSE_LIMIT_MS) {
      keep.push([cursor, previousEnd + PAUSE_KEEP_MS]);
      const resume = cue.atMs - PAUSE_KEEP_MS;
      removed += resume - (previousEnd + PAUSE_KEEP_MS);
      cursor = resume;
    }
    shifted.push({ ...cue, atMs: cue.atMs - removed });
    previousEnd = cue.atMs + cue.slotMs;
  }
  keep.push([cursor, totalMs]);
  return { keep, shifted };
}

function finalize(webmPath: string) {
  const { keep, shifted } = cutPauses(durationMs(webmPath));
  const silent = path.join(OUT, "walkthrough-silent.mp4");
  const trims = keep.map(([a, b], i) => `[0:v]trim=start=${a / 1000}:end=${b / 1000},setpts=PTS-STARTPTS[k${i}]`).join(";");
  execFileSync(FFMPEG, [
    "-y", "-i", webmPath,
    "-filter_complex", `${trims};${keep.map((_, i) => `[k${i}]`).join("")}concat=n=${keep.length}:v=1:a=0,format=yuv420p[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "23", silent,
  ], { stdio: "ignore" });

  const mp4 = path.join(OUT, "walkthrough-demo.mp4");
  const delays = shifted.map((c, i) => `[${i + 1}:a]adelay=${c.atMs}|${c.atMs}[a${i}]`).join(";");
  const mix = `${shifted.map((_, i) => `[a${i}]`).join("")}amix=inputs=${shifted.length}:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000[voice]`;
  execFileSync(FFMPEG, [
    "-y", "-i", silent, ...shifted.flatMap((c) => ["-i", c.file]),
    "-filter_complex", `${delays};${mix}`,
    "-map", "0:v", "-map", "[voice]", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4,
  ], { stdio: "ignore" });

  writeFileSync(path.join(OUT, "cues.json"), JSON.stringify(shifted.map(({ atMs, slotMs, text }) => ({ atMs, slotMs, text })), null, 2));
  writeFileSync(
    path.join(OUT, "NARRATION.txt"),
    [
      "Read each line below, in order, into ONE audio recording.",
      "Leave about 3 seconds of silence between lines. Speak calmly and clearly.",
      "If you make a mistake, pause 3 seconds and read that line again. Afterwards, tell me which line numbers you repeated.",
      "Line 26 (Feedback for Hive) can be changed to your own words about what you saw in Hive.",
      "",
      ...shifted.map((c, i) => `${String(i + 1).padStart(2, "0")}. ${c.text}`),
    ].join("\r\n"),
  );
  console.log(`Saved ${mp4} (${(durationMs(mp4) / 60000).toFixed(1)} minutes, ${keep.length - 1} pauses cut)`);
}

// --remix rebuilds the outputs from the last recording without re-recording.
async function remix() {
  const webmPath = path.join(OUT, "walkthrough-demo.webm");
  const raw: Omit<Cue, "file">[] = JSON.parse(readFileSync(path.join(OUT, "cues-raw.json"), "utf8"));
  rmSync(VOICE, { recursive: true, force: true });
  mkdirSync(VOICE, { recursive: true });
  raw.forEach((cue, i) => cues.push({ ...cue, file: speechFile(cue.text, i).file }));
  finalize(webmPath);
  rmSync(VOICE, { recursive: true, force: true });
}

// Speaks the text and holds the scene until both the minimum time and the
// sentence have finished, so narration never overlaps.
async function say(page: Page, text: string, minMs: number) {
  const { file, ms } = speechFile(text);
  const slotMs = Math.max(minMs, ms + 450);
  cues.push({ file, atMs: Date.now() - startedAt, slotMs, text });
  await page.waitForTimeout(slotMs);
}

const CAPTION_STYLE = [
  "position:fixed", "left:50%", "bottom:28px", "transform:translateX(-50%)", "z-index:99999",
  "background:rgba(18,32,29,.94)", "color:#fff", "padding:14px 24px", "border-radius:12px",
  "font:500 19px/1.45 system-ui,sans-serif", "max-width:980px", "text-align:center",
  "box-shadow:0 10px 30px rgba(0,0,0,.25)", "pointer-events:none",
].join(";");

async function caption(page: Page, title: string, detail = "", ms = 3200, spoken?: string) {
  await page.evaluate(
    ([t, d, style]) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.setAttribute("style", style);
        document.body.appendChild(el);
      }
      el.replaceChildren();
      const head = document.createElement("div");
      head.style.fontWeight = "650";
      head.textContent = t;
      el.appendChild(head);
      if (d) {
        const sub = document.createElement("div");
        sub.style.cssText = "opacity:.82;font-size:16px;margin-top:4px";
        sub.textContent = d;
        el.appendChild(sub);
      }
    },
    [title, detail, CAPTION_STYLE] as const,
  );
  await say(page, spoken ?? [title, detail].filter(Boolean).join(". "), ms);
}

async function card(page: Page, title: string, lines: string[], ms = 5000, spoken?: string) {
  await page.evaluate(
    ([t, ls]) => {
      const el = document.createElement("div");
      el.id = "demo-card";
      el.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:100000;background:#14594f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;text-align:center;padding:40px",
      );
      const h = document.createElement("div");
      h.style.cssText = "font-size:44px;font-weight:700;letter-spacing:-.02em";
      h.textContent = t;
      el.appendChild(h);
      for (const line of ls) {
        const p = document.createElement("div");
        p.style.cssText = "font-size:22px;opacity:.9;margin-top:14px;max-width:1000px";
        p.textContent = line;
        el.appendChild(p);
      }
      document.body.appendChild(el);
    },
    [title, lines] as const,
  );
  await say(page, spoken ?? [title, ...lines].join(". "), ms);
  await page.evaluate(() => document.getElementById("demo-card")?.remove());
}

async function spotlight(locator: Locator, ms = 1800) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el: HTMLElement) => {
    el.dataset.demoOutline = el.style.outline;
    el.style.outline = "3px solid #e8a33d";
    el.style.outlineOffset = "3px";
  });
  await locator.page().waitForTimeout(ms);
  await locator.evaluate((el: HTMLElement) => {
    el.style.outline = el.dataset.demoOutline ?? "";
  });
}

async function main() {
  rmSync(RAW, { recursive: true, force: true });
  rmSync(VOICE, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  mkdirSync(VOICE, { recursive: true });
  const browser = await chromium.launch({ slowMo: 60 });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: RAW, size: SIZE } });
  const page = await context.newPage();
  startedAt = Date.now();

  // 1. Introduction
  if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) throw new Error("Record against a local server only.");
  await page.goto(BASE);
  await card(page, "Spectora Template Importer", [
    "Hive Inspect Forward Deployed Engineer assignment",
    "Import a Spectora template, prove nothing was lost, then edit and copy it.",
  ], 6000, "This is the Spectora template importer, built for the Hive Inspect Forward Deployed Engineer assignment. It imports a Spectora template, proves nothing was lost, and then lets the inspector edit and copy it.");
  await caption(page, "The customer: an inspection company leaving Spectora", "Four years of tuned template. They will not retype it.", 4200);
  await page.mouse.wheel(0, 650);
  await caption(page, "Import, verify, edit, copy", "", 3000);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.getByRole("link", { name: "Sign in to explore" }).click();
  await page.getByLabel("Username").waitFor();
  await caption(page, "Reviewers sign in with the details from the email", "Sessions are signed, HTTP-only cookies checked on every request.");
  await page.getByLabel("Username").pressSequentially("reviewer", { delay: 60 });
  await page.getByLabel("Password").pressSequentially("local-demo-password", { delay: 30 });
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/import$/, { timeout: 60000 });

  // 2. Import
  await caption(page, "Step 1: upload the Spectora export", "InterNACHI Residential, exported with Export to spreadsheet, then Export HTML Text.", 3500);
  await page.getByLabel("Spectora export file").setInputFiles(SAMPLE);
  await page.getByText("392 of 392 rows accounted for").waitFor({ timeout: 60000 });
  await caption(page, "Every row is accounted for, and checked after saving", "The app reads the template back from Postgres and compares each field with the original file.", 4500);
  await spotlight(page.getByText("392 of 392 rows accounted for"), 2500);
  await page.mouse.wheel(0, 420);
  await caption(page, "What could not come across is shown, never dropped", "Split by cause: missing from Spectora's file, not supported here, or unusual in the data.", 4800);
  await spotlight(page.getByText("Not in Spectora's file"), 2200);
  await page.mouse.wheel(0, 500);
  await caption(page, "Example: an empty video embed on row 311", "The video address was never in the export, so the report says so instead of hiding it.", 4500);
  await page.mouse.wheel(0, 700);
  await caption(page, "Every row of the file, with where it went", "Filter by flagged, changed or not placed, and jump straight to any comment.", 4000);

  // 3. Editor
  await page.getByRole("link", { name: /Back to InterNACHI/ }).click();
  await page.getByRole("textbox", { name: "Section name" }).waitFor();
  await caption(page, "Step 2: the template, structured and editable", "13 sections, 69 items, 392 comments, in the original order.", 4000);
  await page.getByRole("button", { name: /^Exterior/ }).click();
  await caption(page, "Formatting and links come across", "Comment HTML is stored exactly as imported and sanitised only when shown.", 3800);
  await spotlight(page.getByRole("link", { name: "Here is a DIY troubleshooting article" }).first(), 2200);
  await page.evaluate(() => window.scrollTo({ top: 0 }));

  const section = page.getByRole("textbox", { name: "Section name" });
  await caption(page, "Rename a section", "", 1800);
  await section.click();
  await section.press("End");
  await section.pressSequentially(" (reviewed)", { delay: 70 });
  await section.press("Enter");
  await page.getByText("All changes saved").waitFor();
  await spotlight(page.getByText("All changes saved"), 1500);

  await caption(page, "Edit a comment as formatted text, no HTML in sight", "", 2000);
  await page.getByRole("button", { name: "Edit text of Cracking - Minor" }).click();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Monitor for widening and re-check in 12 months.", { delay: 35 });
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByText("All changes saved").waitFor();
  await caption(page, "Marked Edited, with Restore original one click away", "", 3000);

  await caption(page, "Reload: the edits are in the database", "", 1800);
  await page.reload();
  await page.getByRole("button", { name: /^Exterior \(reviewed\)/ }).click();
  await spotlight(page.getByText("Monitor for widening"), 2500);

  // 4. Copy
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await caption(page, "Step 3: make a copy", "One Postgres function copies every section, item and comment in a single statement.", 3500);
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Make a copy" }).click();
  await page.getByText("Changes here do not affect it.").waitFor();
  await caption(page, "Change the copy", "", 1800);
  const copySection = page.getByRole("textbox", { name: "Section name" });
  await copySection.fill("");
  await copySection.pressSequentially("Pre-listing Details", { delay: 60 });
  await copySection.press("Enter");
  await page.getByText("All changes saved").waitFor();
  await page.goto(originalUrl);
  await section.waitFor();
  await caption(page, "The original is unchanged", "", 2200);
  await spotlight(page.getByRole("textbox", { name: "Section name" }), 2200);

  // 5. Report after edits
  await page.getByRole("link", { name: "Import report", exact: true }).click();
  await page.getByRole("button", { name: /^Changed/ }).click();
  await caption(page, "The report tracks changes since import", "So the customer can always see what differs from what they brought over.", 4200);

  // 6. Failure case
  await page.goto(`${BASE}/import`);
  await caption(page, "A failure case: the wrong file", "", 1800);
  await page.getByLabel("Spectora export file").setInputFiles({
    name: "inspection-notes.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("These are notes, not a Spectora export."),
  });
  await page.getByRole("alert").filter({ hasText: "not a spreadsheet" }).waitFor();
  await caption(page, "Refused with a reason, and nothing is saved", "Damaged files, missing columns and unrelated spreadsheets fail the same honest way.", 4200);

  // 7. Repo, data model, decisions, hard part, Hive
  const REPO = "https://github.com/OmMistry1406/hive-template-importer";
  const gh = async (url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
  };
  await gh(REPO);
  await caption(page, "The repo", "Next.js on Vercel, Supabase Postgres, schema managed with the Supabase CLI.", 5000,
    "The repo. It is a Next.js app on Vercel with Supabase Postgres. The importer lives in source, lib, import, and the database schema in supabase migrations. I started from create next app and built the rest with Claude Code. A second AI agent reviewed the code on its own and found seven bugs, which I fixed.");
  await gh(`${REPO}/blob/main/docs/ARCHITECTURE.md#data-model`);
  await caption(page, "The data model", "Provenance tables keep the upload verbatim; templates, sections, items and comments are the working copy.", 5000,
    "The data model has two layers. Import runs, source rows and issues keep exactly what was uploaded, and are never edited. That is the proof. Templates, sections, items and comments are the working copy, ordered by position. Copying a template is one Postgres function, so it is all or nothing.");
  await gh(`${REPO}/blob/main/NOTES.md#what-i-cut-and-why`);
  await caption(page, "Decisions", "Extra time went into making the import checkable; the cuts are written down with reasons.", 5000,
    "My priority was a faithful import. I spent the extra time on making it checkable, because a customer with four years of content will not switch on trust. I left out drag and drop reordering, section editing and per company accounts, and wrote down why in the notes.");
  await gh(`${REPO}/blob/main/NOTES.md#the-hardest-problems`);
  await caption(page, "The hard part", "Order values repeat in 38 of 69 items; escaping differs by column.", 5000,
    "The hardest problem was ordering. The Order column repeats values in thirty eight items, so I keep the file's row order and flag any conflict. Escaping also differs by column. Names are HTML escaped, options are not, and comment text is HTML, so each needs different handling.");
  await gh(`${REPO}/blob/main/NOTES.md#hive-and-binsr`);
  await caption(page, "Feedback for Hive", "", 4500,
    "Feedback for Hive. The import asks users to review the result by hand. A row by row report like this one would make switching much easier to trust.");

  await card(page, "Built for a customer who will not retype", [
    "Next.js on Vercel, Supabase Postgres, schema managed with the Supabase CLI",
    "60 unit and database tests, 23 browser tests, including hostile HTML and forged sessions",
    "Repo: github.com/OmMistry1406/hive-template-importer",
  ], 7000, "Built with Next.js on Vercel and Supabase Postgres. Sixty unit and database tests, and twenty-three browser tests, cover the workflow and the failure cases. Thanks for watching.");

  await context.close();
  await browser.close();

  const [webm] = readdirSync(RAW).filter((f) => f.endsWith(".webm"));
  const webmPath = path.join(OUT, "walkthrough-demo.webm");
  renameSync(path.join(RAW, webm), webmPath);
  writeFileSync(path.join(OUT, "cues-raw.json"), JSON.stringify(cues.map(({ atMs, slotMs, text }) => ({ atMs, slotMs, text })), null, 2));
  finalize(webmPath);
  rmSync(RAW, { recursive: true, force: true });
  rmSync(VOICE, { recursive: true, force: true });
}

(process.argv.includes("--remix") ? remix() : main()).catch((error) => {
  console.error(error);
  process.exit(1);
});
