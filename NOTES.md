# Notes

## What I built

A Spectora HTML-text importer with an editor, independent copies, Postgres persistence and a row-by-row import report.

The importer is rule-based and uses no model. The export is a regular table, so rules give the same answer every time and can be tested. A model would add a way to rewrite or invent customer text with no benefit on this input.

## Improvement: an import you can check

**Customer problem:** a company with four years of tuned content will not switch on a promise. Reading 392 comments to check them is the work they are trying to avoid.

**What I built:** after saving, the app reads the template back from the database and compares it, field by field, with the original rows. If anything differs, the import rolls back. The report then shows:

- Where every row of the file went, and whether it has changed since.
- Everything flagged, split by cause: missing from Spectora's file, not supported here, or unusual in the data.
- Links from each flag straight to the comment.

Editing keeps this useful: each changed comment is marked Edited and has Restore original.

Hive's import docs tell users to review the result by hand and list no row-level check. That gap is why I spent the time here.

## Supported input

- Spectora's Export to spreadsheet, then Export HTML Text. The file is an `.xlsx` zip that Spectora names `.xls`, so the type is read from the file's bytes.
- `str`, shared-string and inline cells, so a file re-saved in Excel should also work.
- Columns matched by heading, in any order. Unknown columns are kept and flagged.
- Up to 4 MB, because Vercel limits request bodies. Spreadsheets hold photo addresses, not images, so templates should fit comfortably.

## Formatting, links and rich content

Stored comment HTML is byte-for-byte what the file contained, including line endings and non-breaking spaces. It is sanitised only when displayed.

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

## Missing from the export, versus not supported here

The app keeps these separate, because the customer's next step differs.

**Missing from Spectora's file. No importer can recover these:**

- The video in the comment on row 311: its `youtube-embed-wrapper` box is in the export, empty.
- Comment text for 9 defect or limit comments (6 defects, 3 limits). The file has an empty cell.
- Section settings: overview grid, optional sections, icons, standards of practice, reminders. Item settings: reminders, info-only options, optional include. Template settings. Spectora's help documents these as not carried.
- A template name column, section or item IDs, and any way to tell two adjacent same-named sections apart.
- Empty sections or items, which have no row to appear on.

**In the file but not supported here:** default photo copying, tables in the editor, playing embedded videos, and any behaviour for answer types, estimates, locks and defaults. Report writing is out of scope, so those values are stored and shown read-only.

## The hardest problems

1. **Order.** `Order (w/i item)` looks authoritative, but 38 of 69 items repeat a value and 42 have gaps. Sorting by it would be unstable, so file row order is the truth. It always agreed with `Order` in this sample. If a future file disagrees, file order is kept and the row is flagged.
2. **Double escaping.** Names are HTML-escaped inside XML: `Doors, Windows &amp; Interior`. They need one decode. Comment text must not be decoded, because it is HTML.
3. **Not treating a parser as its own witness.** A check that reuses parser output agrees with parser bugs. Verification compares database contents with stored source rows, and a test corrupts stored data to prove the check fires.
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
| Save fails while editing | "Not saved" with Retry; the text stays on screen |
| Editing a record that was deleted | Clear error |

## How I checked it

- **Independent expected numbers.** Before writing the parser, I profiled the raw worksheet XML with a separate Python script: 392 rows, 13 sections, 69 items, 309 comments with text, 43 links. Tests assert those numbers.
- **`npm test`:** parser cases, other cell encodings, reordered columns, refused files, and sanitising, plus real Postgres tests on PGlite for import, verification, rollback, edits and copies.
- **Mutation checks:** tests tamper with stored text and drop a comment, and confirm verification fails. Another confirms a failed import leaves row counts unchanged.
- **Independent copies:** tests compare all content, confirm no IDs are shared, and edit each side to confirm the other is unchanged. Deleting the original leaves the copy intact.
- **`npm run test:e2e`:** a headless browser uploads the real file, edits, reloads, copies and tries a bad file.

## What I cut, and why

- **Login and per-company accounts.** Reviewers should reach the template at once. Required before real customers use it.
- **Reordering and moving by drag.** Valuable, but not needed to prove a faithful import.
- **Section and item add or delete.** Comments can be added and removed; structure edits came second to fidelity.
- **Export back out.** Out of the brief's workflow.
- **Link checking.** Would make outbound requests to third-party sites at import time.
- **Copying default photos.** The sample has none, so I could not test it. Flagged instead.
- **Conflict detection between two open tabs.** Last save wins. Acceptable for one user; real teams need it.
- **Rate limiting** on the public demo.
- **AI features.** See the top of this file.

## Hive and Binsr

_To be completed after hands-on use of Hive. This section must be based on real use, so it is deliberately left open._

So far I have read Hive's docs only. Points to confirm in the product:

- Import guidance says to review by hand and lists no row-level report.
- Comment types cannot be changed in the template editor; a new comment must be created.
- Deleting a comment in the template editor has no confirmation, per the docs.
- Uploading the same file twice creates a second copy. This app has the same behaviour but warns on the report.

## Built on

Next.js, Tiptap, sanitize-html, htmlparser2, xmldom, fflate, he, pg, PGlite, Tailwind CSS, lucide-react, Vitest, Playwright, and the Supabase CLI. Everything in `src`, `supabase`, `tests` and `e2e` was written for this project.

## How I used AI

I used Claude Code to read the brief and both products' docs, profile the export, and write the code and tests. I reviewed the decisions and am responsible for the result. `scripts/` and `e2e/` contain the reusable pieces.

## Time spent

_To be completed at submission._
