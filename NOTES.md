# Notes

## Access

- **Live app:** https://hive-template-importer-theta.vercel.app. The home page is public and plays a short walkthrough video.
- **Sign in:** use the reviewer username and password from the submission email. You land on the imported InterNACHI Residential template.
- **Local run:** no credentials needed. See [README.md](README.md).

## What I built

A Spectora HTML-text importer with an editor, independent copies, Postgres persistence, and a row-by-row import report.

The importer is rule-based and uses no model. The export is a regular table, so rules give the same answer every time and can be tested. A model would add a way to rewrite or invent customer text, with no benefit on this input.

## Improvement: an import you can check

**Customer problem:** a company with four years of tuned content will not switch on a promise. Reading 392 comments to check them is the work they are trying to avoid.

**What I built:** after saving, the app reads the template back from the database and compares it with the original rows: every field, plus the grouping of rows into items and sections. If anything differs, the import rolls back. The report then shows:

- Where every row of the file went, and whether it has changed since.
- Everything flagged, split by cause: missing from Spectora's file, not supported here, or unusual in the data.
- Links from each flag straight to the comment.

Editing keeps this useful: each changed comment is marked Edited and has Restore original.

Hive's import docs tell users to review the result by hand and list no row-level check. That gap is why I spent the time here.

## Supported input

- Spectora's Export to spreadsheet, then Export HTML Text. The file is an `.xlsx` zip that Spectora names `.xls`, so the type is read from the file's bytes.
- `str`, shared-string and inline cells. Excel's `_xHHHH_` escapes are decoded, so a file re-saved in Excel also works.
- Columns are matched by heading, in any order. Unknown columns, and values under no heading, are kept and flagged.
- Up to 4 MB, because Vercel limits request bodies. Spreadsheets hold photo addresses, not images, so templates fit comfortably.

## Formatting, links and rich content

Stored comment HTML is byte-for-byte what the file contained, including line endings and non-breaking spaces. It is sanitised only when displayed or when an edit is saved.

| Content | Handling |
|---|---|
| Paragraphs, bold, italics, lists, colours | Shown and editable |
| Links | Shown and editable. 43 in the sample, all preserved. Not checked for being alive |
| Images in comment text | Shown and editable; files stay on the original host |
| Tables | Shown. Editing the comment loses the layout, which is flagged. Restore original brings it back |
| Embedded video (`iframe`) | Shown as a link, and flagged |
| Other tags, such as `video` | Kept in the stored original, not shown, and flagged |
| Scripts, event handlers, `javascript:` links | Kept in the stored original, never shown |
| Default photos | Address kept, image not copied, flagged. Hive's importer does copy these |
| Multiple-choice options | Split on commas. The format has no escape for a comma inside an option, so that ambiguity is the format's |

## Missing from the export, versus not supported here

The app keeps these separate, because the customer's next step differs.

**Missing from Spectora's file. No importer can recover these:**

- The video in the comment on row 311: its `youtube-embed-wrapper` box is in the export, empty.
- Comment text for 9 defect or limit comments (6 defects, 3 limits). The file has an empty cell.
- Section settings: overview grid, optional sections, icons, standards of practice, reminders. Item settings: reminders, info-only options, optional include. Template settings. Spectora's help documents these as not carried.
- A template name column, section or item IDs, and any way to tell two adjacent same-named sections apart.
- Empty sections or items, which have no row to appear on.
- Real cost estimates: every row carries the same `10`–`1000`, which looks like Spectora's default. Hive's docs warn about the same thing.

**In the file but not supported here:** default photo copying, tables in the editor, playing embedded videos, and any behaviour for answer types, estimates, locks and defaults. Report writing is out of scope, so those values are stored and shown read-only.

## The hardest problems

1. **Order.** `Order (w/i item)` looks authoritative, but 38 of 69 items repeat a value and 42 have gaps. Sorting by it would be unstable, so file row order is the truth. It always agreed with `Order` in this sample. If a future file disagrees, file order is kept and the row is flagged.
2. **Escaping differs by column.** Section and item names are HTML-escaped (`Doors, Windows &amp; Interior`, 252 cells). Option lists are not (`Bradford & White`). Comment text is HTML and must never be decoded. Names get one strict decode, so only complete entities ending in `;` are touched. Options are never decoded.
3. **Not treating a parser as its own witness.** A check that reuses parser output agrees with parser bugs. Verification reads the database, uses its own entity decoder, and also checks that rows were grouped into the right items. Tests corrupt stored data, drop a comment, regroup comments and merge items, to prove the check fires.
4. **Editors rewrite HTML.** Merely opening a comment in Tiptap would normalise it. "Changed" is judged against the editor's own first rendering, so an untouched comment keeps its original bytes.

Known remaining limit: if a file's `Order` truly disagrees with its row order, Spectora says `Order` wins, while this app keeps row order and warns. I could not produce such a file, so I left the visible behaviour.

## Failure handling

| Case | Result |
|---|---|
| Not a spreadsheet, or old binary `.xls` | Refused, with what to do instead |
| Damaged or truncated file | Refused |
| Unrelated spreadsheet, or required column missing | Refused, naming the columns |
| Headings but no rows | Refused |
| Row with no section or item | Not placed in the template; shown in the report with its content kept |
| Stored data does not match the file | Whole import rolled back |
| Database failure during import | Rolled back; nothing saved |
| Save fails while editing | "1 change not saved" stays visible until that change succeeds. Retry re-sends it |
| Editing a record that was deleted | Clear error |
| Session expired or missing | Pages redirect to sign-in; the upload API returns 401 |

## How I checked it

- **Independent expected numbers.** Before writing the parser, I profiled the raw worksheet XML with a separate Python script: 392 rows, 13 sections, 69 items, 309 comments with text, 43 links. Tests assert those numbers.
- **`npm test`, 60 tests:**
  - Parser cases, other cell encodings, reordered columns, refused files, sanitising, decoding and sign-in tokens.
  - Real Postgres tests on PGlite for import, verification, rollback, edits and copies.
- **`npm run test:e2e`, 23 browser tests.**
  - Positive: sign in, import the real file, keep links, edit and reload, bold text, restore original, search, add and delete, independent copies in both directions, report tracking.
  - Negative: six kinds of refused file, hostile HTML (`<script>`, `onerror`, `javascript:` links; no dialog fires), a row with no section, empty names, unknown IDs, a forged session cookie, an open-redirect attempt, a wrong password, and the API without a session.
- **Independent code review.** A separate AI agent reviewed the code without seeing my reasoning. It found seven real issues, all now fixed:
  - A failed save could later show "All changes saved".
  - Options were decoded although the export does not escape them.
  - Excel escapes were not decoded.
  - Verification missed regrouped rows.
  - An idle database connection error could crash the server.
  - A failed rollback was not handled.
  - Server action input was not type-checked.
- **`npm run db:check` on Supabase:**
  - Row-level security is on for all 7 tables.
  - `copy_template` can be run only by `postgres` and `service_role`.
  - The seeded import verified 5,881 fields with no differences. The current verifier also checks structure, so a fresh import now reports 5,884 checks.
- **Supabase public API, probed with the anon key:** reads return nothing, and inserts and `copy_template` calls are refused.
- **Live deployment:**
  - A wrong file returns 422 with a reason.
  - A real import returns 201. I deleted that test import afterwards.

## What I cut, and why

- **Per-company accounts.** One shared reviewer login is enough for a demo. Real customers need their own accounts and data separation.
- **Reordering and moving by drag.** Valuable, but not needed to prove a faithful import.
- **Section and item add or delete.** Comments can be added and removed; structure edits came second to fidelity.
- **Export back out.** Out of the brief's workflow.
- **Link checking.** Would make outbound requests to third-party sites at import time.
- **Copying default photos.** The sample has none, so I could not test it. Flagged instead.
- **Conflict detection between two open tabs.** Last save wins. Acceptable for one user; real teams need it.
- **Rate limiting** on sign-in and uploads.
- **Verified TLS to the database.** The connection is encrypted, but the server certificate is checked only if `DATABASE_CA_CERT` is set. I did not set it for the demo.
- **AI features.** See "What I built".

## Hive and Binsr

I explored Hive and Spectora, and not Binsr. With two days, I put the time into the import quality that this customer cares about.

**From Hive's documentation:**

- Spectora import takes the same HTML-text spreadsheet. It converts sections, items and comments, copies comment photos, and can optionally import cost estimates.
- The review step is manual: "Open the new template and review it", then move comments that landed in the wrong group. There is no row-by-row account of what came across, which is the gap this project addresses.
- The docs list what does not carry over, such as Spectora's "optional" setting and ratings. They do not tell the user which comments were affected.
- Uploading the same file twice silently creates a second copy. This app also creates a copy, but warns on the report.
- In the template editor, comment types cannot be changed, and deleting a comment has no confirmation. Saving is explicit, with a bar for unsaved changes.

**From the start of my trial** (organisation "Hive FDE Assignment"):

- Creating an inspection asks for scheduling, address, client and service before anything else. The template is not chosen on that form; it comes through the selected service. A new user who wants to try a template has to set up a service first.

## Built on

Next.js, Tiptap, sanitize-html, htmlparser2, xmldom, fflate, he, pg, PGlite, Tailwind CSS, lucide-react, Vitest, Playwright, ffmpeg-static, and the Supabase CLI. Everything in `src`, `supabase`, `tests`, `e2e` and `scripts` was written for this project.

## How I used AI

I used Claude Code throughout:

- Read the brief and both products' docs.
- Profile the export.
- Write the code and tests.
- Record the demo video with a Playwright script.

A second agent did an independent code review, and its findings are listed above. I reviewed the decisions and am responsible for the result. Reusable pieces:

- `scripts/record-demo.ts` records the captioned walkthrough.
- `scripts/check-db.ts` checks database security and verification.
- `scripts/seed.ts` imports the sample through the real importer.

## Time spent

About two days, hackathon style. That covers product exploration in Hive and Spectora, building and testing, deployment, and the walkthrough.
