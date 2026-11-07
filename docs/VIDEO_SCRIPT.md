# Walkthrough script

Target 9 to 10 minutes, follow Hive's outline. Camera on for part 1. Record your screen with OBS or a Zoom call to yourself, then upload to YouTube as unlisted.

`public/media/walkthrough.mp4` is a captioned 2-minute product demo. Use it as a backup, or play it during part 2 while you talk over it.

## 1. You (30 seconds, camera on)

"Hi, I'm Om Umaraliya. I build full-stack products, mostly in TypeScript and Postgres. This is my template importer for the Hive Forward Deployed Engineer assignment."

Add one or two lines on what you have built before.

## 2. What I built (3 minutes)

1. Open the live URL and the home page. "The customer is an inspection company leaving Spectora with a template tuned for four years. They will not retype it."
2. Sign in. Go to Import, and upload `samples/InterNACHI-Residential-2026-11-06.xls`.
3. On the report: "392 of 392 rows accounted for. After saving, the app read the template back from Postgres and compared every field and the grouping with the original file. Zero differences."
4. Open the template. Show an Exterior comment's link.
5. Rename a section. Edit Cracking - Minor, add a sentence, press Done. Point at "All changes saved". Reload to show it persisted. Point at Edited and Restore original.
6. Click Make a copy. Rename a section in the copy. Open the original and show it unchanged.

## 3. The repo (1 minute)

Show the folder tree:

- `src/lib/import` is the importer: reader, parser, HTML checks, verification, and the import transaction.
- `src/lib/db` holds the queries.
- `supabase/migrations` is the schema, applied with the Supabase CLI.
- `tests` and `e2e` hold 60 unit and database tests and 23 browser tests.

"I started from create-next-app, and everything else was written for this project. I used Claude Code for most of the code, and a second agent reviewed it independently. It found seven real bugs, which I fixed. They are listed in NOTES.md."

## 4. The data model (1.5 minutes)

Open `docs/ARCHITECTURE.md`.

- "Two layers. `import_runs`, `import_source_rows` and `import_issues` keep exactly what was uploaded and are never edited. That is the proof."
- "`templates`, `sections`, `items` and `comments` are the working copy, with position integers for order. Each comment keeps its imported text, which powers Edited and Restore original."
- "Copy is one Postgres function, a single statement, so a failed copy leaves nothing."
- "How I checked: I profiled the file with a separate Python script before writing the parser, and the tests assert those numbers."

## 5. My decisions (1.5 minutes)

- "Priority was faithful import. I spent my extra time on making the import checkable, because a customer with four years of content won't switch on a promise, and Hive's own import asks users to review by hand."
- "Left out: drag reordering, section add and delete, per-company accounts, and photo copying. All are listed with reasons in NOTES.md."
- "I explored Hive and Spectora, not Binsr, to keep the time on import quality."

## 6. The hard part (1.5 minutes)

- "The Order column looks authoritative, but 38 of 69 items repeat a value, so I keep file order and flag conflicts."
- "Escaping differs by column. Names are HTML-escaped, options are not, and comment text is HTML. Getting that wrong silently changes text."
- Show the report flag for row 311: "This comment has an empty video box. The video address is not in Spectora's export at all, so the report says it is missing from the file, not that my importer dropped it."
- Failure case: upload a wrong file, such as a text file renamed to `.xls`. "Refused, with a reason, and nothing saved."

## 7. Hive (30 seconds)

Give one or two direct points from your own use of Hive. For example: "The import asks me to review the result by hand, with no list of what changed or was skipped. A row-level report like this one would make switching easier to trust."

Only say what you saw yourself.
