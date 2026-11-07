import { ArrowLeft, CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportRows, type ReportRow } from "@/components/ReportRows";
import { getDb } from "@/lib/db/client";
import { getImportReport, getTemplateTree } from "@/lib/db/templates";
import type { IssueOrigin } from "@/lib/import/types";
import { decodeName } from "@/lib/import/parse";

export const dynamic = "force-dynamic";

const ORIGINS: { origin: IssueOrigin; title: string; blurb: string }[] = [
  { origin: "export_gap", title: "Not in Spectora's file", blurb: "This information was never in the export, so no importer could recover it. Check these against Spectora." },
  { origin: "importer_limit", title: "In the file, not supported here", blurb: "The original is stored, but this app does not show or use it." },
  { origin: "source_data", title: "Worth a look in your data", blurb: "Imported as written. These look unusual and you may want to review them." },
];

export default async function ReportPage({ params, searchParams }: PageProps<"/templates/[id]/report">) {
  const { id } = await params;
  const { imported } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const template = await getTemplateTree(db, id);
  if (!template?.importRunId) notFound();
  const report = await getImportReport(db, template.importRunId);
  if (!report) notFound();

  const { stats, verification } = report;
  const { rows: earlier } = await db.query<{ n: number }>(
    "select count(*)::int as n from import_runs where file_sha256 = $1 and id <> $2",
    [report.fileSha256, report.id],
  );
  const accounted = stats.mapped + stats.structureOnly + stats.quarantined + stats.blank;
  const header = (start: string) => report.headers.find((h) => h.toLowerCase().startsWith(start)) ?? "";
  const [sectionH, itemH, nameH] = ["section name", "item name", "comment name"].map(header);

  const placed = new Map(
    template.sections.flatMap((s) =>
      s.items.flatMap((i) => i.comments.filter((c) => c.sourceRowId).map((c) => [c.sourceRowId!, c] as const)),
    ),
  );
  const issuesByRow = new Map<number, string[]>();
  for (const issue of report.issues) {
    if (issue.rowNumber === null) continue;
    issuesByRow.set(issue.rowNumber, [...(issuesByRow.get(issue.rowNumber) ?? []), issue.message]);
  }

  const rows: ReportRow[] = report.rows.map((row) => {
    const comment = placed.get(row.id);
    let status: ReportRow["status"];
    if (row.disposition === "quarantined") status = "Not placed";
    else if (row.disposition === "blank") status = "Blank row";
    else if (row.disposition === "structure_only") status = "Item only";
    else if (!comment) status = "Removed";
    else if (comment.textHtml !== comment.importedTextHtml || comment.name !== comment.importedName) status = "Edited";
    else status = "Imported";
    return {
      rowNumber: row.rowNumber,
      section: decodeName(row.cells[sectionH] ?? ""),
      item: decodeName(row.cells[itemH] ?? ""),
      comment: decodeName(row.cells[nameH] ?? ""),
      status,
      commentId: comment?.id ?? null,
      issues: issuesByRow.get(row.rowNumber) ?? [],
    };
  });

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <Link href={`/templates/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to {template.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Import report</h1>
      <p className="mt-1 text-sm text-muted">
        {report.fileName}, imported {new Date(report.createdAt).toUTCString()}
        {template.copiedFromName && `. This template is a copy of ${template.copiedFromName}; statuses below describe this copy.`}
      </p>

      {imported && <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">Import finished. Review anything flagged below, then start editing.</p>}

      {earlier[0].n > 0 && (
        <p className="mt-3 rounded-md bg-limit-soft px-3 py-2 text-sm text-limit">
          This exact file has been imported {earlier[0].n} other time{earlier[0].n === 1 ? "" : "s"}. Each import makes a separate template; nothing is merged.
        </p>
      )}

      <div className={`mt-4 flex gap-3 rounded-lg border p-4 ${stats.quarantined === 0 && verification.ok ? "border-accent/30 bg-accent-soft" : "border-limit/40 bg-limit-soft"}`}>
        {stats.quarantined === 0 ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-limit" />}
        <div>
          <p className="font-semibold">{accounted} of {report.rowCount} rows accounted for{stats.quarantined > 0 && `, ${stats.quarantined} could not be placed`}</p>
          <p className="mt-0.5 text-sm">
            After saving, the app read the template back from the database and compared {verification.fieldsChecked} fields across {verification.rowsChecked} rows with your original file. {verification.mismatches.length} differences found.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stat("Rows in file", stats.rows)}
        {stat("Sections", stats.sections)}
        {stat("Items", stats.items)}
        {stat("Comments", stats.comments)}
        {stat("With text", stats.commentsWithText)}
        {stat("Links", stats.linkCount)}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">What needs your attention</h2>
        {report.issues.length === 0 && <p className="mt-2 text-sm text-muted">Nothing was flagged.</p>}
        {ORIGINS.map(({ origin, title, blurb }) => {
          const issues = report.issues.filter((i) => i.origin === origin);
          if (issues.length === 0) return null;
          return (
            <details key={origin} open={issues.length <= 12} className="mt-3 rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-3">
                <span className="font-medium">{title}</span> <span className="text-sm text-muted">({issues.length})</span>
                <p className="text-sm text-muted">{blurb}</p>
              </summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {issues.map((issue) => {
                  const source = rows.find((r) => r.rowNumber === issue.rowNumber);
                  return (
                    <li key={issue.id} className="flex gap-3 px-4 py-2">
                      <span className="w-16 shrink-0 tabular-nums text-muted">{issue.rowNumber ? `Row ${issue.rowNumber}` : "File"}</span>
                      <div className="min-w-0">
                        <p>{issue.message}</p>
                        {source?.commentId && <Link className="text-accent underline" href={`/templates/${id}?comment=${source.commentId}`}>{source.section} / {source.comment}</Link>}
                        {issue.detail && <p className="break-all text-xs text-muted">{issue.detail}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Every row of your file</h2>
        <p className="text-sm text-muted">Shows where each row went and whether it has changed since import.</p>
        <ReportRows rows={rows} templateId={id} />
      </section>

      <section className="mt-8 text-sm text-muted">
        <h2 className="text-lg font-semibold text-foreground">What this format cannot carry</h2>
        <p className="mt-1">Spectora documents that these are not part of a spreadsheet export or import, so re-check them by hand:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Section settings: overview grid, optional sections, icons, standards of practice and reminders.</li>
          <li>Item settings: reminders, info-only options and optional include.</li>
          <li>Template-level settings.</li>
          <li>The file has no template name column. The name comes from the file name; you can rename it.</li>
          <li>The file has no section or item IDs. Two neighbouring sections with the same name cannot be told apart and arrive as one.</li>
          <li>Sections and items exist only through their rows, so one with no comments may not appear in the file.</li>
          <li>Default photos arrive only as addresses. They are stored and flagged, but the images are not copied.</li>
        </ul>
      </section>
    </main>
  );
}
