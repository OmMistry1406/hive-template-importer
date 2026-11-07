# Architecture

## Flow

```
Browser upload
  -> POST /api/imports
  -> readWorkbook        bytes to rows; file type comes from leading bytes
  -> parseSpectoraSheet  rows to tree, source rows and issues
  -> one transaction:
       write run, source rows, issues, template tree
       read the template back from the database
       verifyStoredTemplate against the untouched source rows
       any mismatch: roll back, save nothing
  -> import report
```

Editing goes through server actions. The browser never holds database credentials. Signed-out visitors see only the home page and sign-in.

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js on Vercel | One deployable for UI and server code |
| Database | Supabase Postgres, schema managed by Supabase CLI | Real persistence and versioned migrations |
| Driver | `pg` through the transaction pooler | Suits serverless and supports real transactions |
| Local and test database | PGlite | Real Postgres behaviour with no credentials |
| Comment editor | Tiptap | Rich text without showing HTML to an inspector |
| Sanitising | `sanitize-html` | Uploaded HTML is untrusted |

## Data model

```
import_runs 1---* import_source_rows   every row of the file, verbatim
     |      1---* import_issues        anything flagged
     |
     *---1 templates 1---* sections 1---* items 1---* comments
              |                                         |
              | copied_from_id                          | source_row_id
              +--> templates                            +--> import_source_rows
```

Two layers do different jobs:

- **Provenance** (`import_*`) records what was uploaded. It is never edited, and it is what proves nothing was lost.
- **Working copy** (`templates`, `sections`, `items`, `comments`) is what people change.

Key decisions:

- **`position` integers, unique within a parent.** Order is data, and the export has no reliable alternative: 38 of 69 items repeat an `Order` value.
- **`imported_name` and `imported_text_html`.** Stored beside the live values, so "Edited" and "Restore original" work, and carry over to copies.
- **`comments` holds every row type.** Checkbox, number and text fields sit in the same ordered list as defect comments, so they share a table.
- **Enum-like columns are free text.** An unexpected value in a customer's file should be kept and flagged, not rejected by a constraint.
- **`attributes` jsonb.** Columns with no behaviour here (estimates, defaults, photos, unknown columns) are kept exactly and shown read-only.
- **`text_html` stays exactly as imported.** Sanitising happens on display and when an edit is saved. Storing a cleaned version would change the customer's content.

## Copying

`copy_template()` is one SQL statement inside a Postgres function, so a failure leaves nothing behind. Every section, item and comment gets a new ID. Nothing in the working layer is shared between a template and its copy. Both may still point at the same read-only source rows.

## Security

- One shared reviewer sign-in. `src/proxy.ts` sends signed-out requests to `/login`, and every server action and the upload route check the session again.
- Sessions are HMAC-signed, HTTP-only, `SameSite=Lax` cookies that expire after 7 days. Credentials are compared in constant time, and the post-sign-in redirect only allows same-site paths.
- On Vercel, missing sign-in variables disable sign-in rather than falling back to local defaults.
- Real customers would need per-company accounts and data separation.
- Row level security is on with no policies, so Supabase's public REST API returns nothing. The app connects server-side.
- `copy_template` execute rights are revoked from `public`.
- Comment HTML is sanitised on the server before reaching the browser: scripts, event handlers and `javascript:` links are removed.
- Uploads are limited to 4 MB, and archive expansion to 100 MB.

## Mapping to Hive

| Spectora export | This app | Hive (from its docs) |
|---|---|---|
| Section Name | `sections` | Section |
| Item Name | `items` | Subsection |
| Comment Type `info` / `limit` / `defect` | `comments.comment_type` | Information / Limitations / Defects groups |
| Answer Type `boolean`, `checkbox`, `text` | `comments.answer_type` | Checkbox Item, Multiple Choice, Text |
| Category | `comments.category` | Defect category |
| Default Estimate Min/Max | `comments.attributes` | Estimated Cost (optional import) |
