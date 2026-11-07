import type { Db, Queryable } from "./client";
import type { Disposition, Issue, ImportStats, Verification } from "@/lib/import/types";
import type { StoredSourceRow, StoredTemplate } from "@/lib/import/verify";

export type CommentRow = StoredTemplate["sections"][number]["items"][number]["comments"][number] & {
  id: string;
  importedName: string | null;
  importedTextHtml: string | null;
};
export type ItemRow = { id: string; name: string; importedName: string | null; comments: CommentRow[] };
export type SectionRow = { id: string; name: string; importedName: string | null; items: ItemRow[] };

export type TemplateSummary = {
  id: string;
  name: string;
  importRunId: string | null;
  copiedFromId: string | null;
  copiedFromName: string | null;
  updatedAt: string;
  createdAt: string;
  sectionCount: number;
  commentCount: number;
};

export type TemplateTree = TemplateSummary & { sections: SectionRow[] };

type SummaryRow = {
  id: string;
  name: string;
  import_run_id: string | null;
  copied_from_id: string | null;
  copied_from_name: string | null;
  updated_at: Date | string;
  created_at: Date | string;
  section_count: number;
  comment_count: number;
};

const SUMMARY_SQL = `
  select t.id, t.name, t.import_run_id, t.copied_from_id, parent.name as copied_from_name,
         t.updated_at, t.created_at,
         (select count(*)::int from sections s where s.template_id = t.id) as section_count,
         (select count(*)::int from comments c
            join items i on i.id = c.item_id
            join sections s on s.id = i.section_id
           where s.template_id = t.id) as comment_count
  from templates t left join templates parent on parent.id = t.copied_from_id`;

const toSummary = (r: SummaryRow): TemplateSummary => ({
  id: r.id,
  name: r.name,
  importRunId: r.import_run_id,
  copiedFromId: r.copied_from_id,
  copiedFromName: r.copied_from_name,
  updatedAt: new Date(r.updated_at).toISOString(),
  createdAt: new Date(r.created_at).toISOString(),
  sectionCount: r.section_count,
  commentCount: r.comment_count,
});

export async function listTemplates(q: Queryable): Promise<TemplateSummary[]> {
  const { rows } = await q.query<SummaryRow>(`${SUMMARY_SQL} order by t.created_at asc, t.name asc`);
  return rows.map(toSummary);
}

export async function getTemplateTree(q: Queryable, id: string): Promise<TemplateTree | null> {
  const { rows } = await q.query<SummaryRow>(`${SUMMARY_SQL} where t.id = $1`, [id]);
  if (!rows[0]) return null;

  const sections = await q.query<{ id: string; name: string; imported_name: string | null }>(
    "select id, name, imported_name from sections where template_id = $1 order by position",
    [id],
  );
  const items = await q.query<{ id: string; section_id: string; name: string; imported_name: string | null }>(
    `select i.id, i.section_id, i.name, i.imported_name
     from items i join sections s on s.id = i.section_id
     where s.template_id = $1 order by i.position`,
    [id],
  );
  const comments = await q.query<{
    id: string;
    item_id: string;
    name: string;
    text_html: string | null;
    comment_type: string | null;
    category: string | null;
    recommendation: string | null;
    answer_type: string | null;
    choice_options: string[];
    unit_options: string[];
    attributes: Record<string, string>;
    source_row_id: string | null;
    imported_name: string | null;
    imported_text_html: string | null;
  }>(
    `select c.id, c.item_id, c.name, c.text_html, c.comment_type, c.category, c.recommendation,
            c.answer_type, c.choice_options, c.unit_options, c.attributes, c.source_row_id,
            c.imported_name, c.imported_text_html
     from comments c
     join items i on i.id = c.item_id
     join sections s on s.id = i.section_id
     where s.template_id = $1 order by c.position`,
    [id],
  );

  const commentsByItem = new Map<string, CommentRow[]>();
  for (const c of comments.rows) {
    const list = commentsByItem.get(c.item_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      textHtml: c.text_html,
      commentType: c.comment_type,
      category: c.category,
      recommendation: c.recommendation,
      answerType: c.answer_type,
      choiceOptions: c.choice_options,
      unitOptions: c.unit_options,
      attributes: c.attributes,
      sourceRowId: c.source_row_id,
      importedName: c.imported_name,
      importedTextHtml: c.imported_text_html,
    });
    commentsByItem.set(c.item_id, list);
  }
  const itemsBySection = new Map<string, ItemRow[]>();
  for (const i of items.rows) {
    const list = itemsBySection.get(i.section_id) ?? [];
    list.push({
      id: i.id,
      name: i.name,
      importedName: i.imported_name,
      comments: commentsByItem.get(i.id) ?? [],
    });
    itemsBySection.set(i.section_id, list);
  }

  return {
    ...toSummary(rows[0]),
    sections: sections.rows.map((s) => ({
      id: s.id,
      name: s.name,
      importedName: s.imported_name,
      items: itemsBySection.get(s.id) ?? [],
    })),
  };
}

async function touchTemplate(q: Queryable, id: string) {
  await q.query("update templates set updated_at = now() where id = $1", [id]);
}

export class NotFound extends Error {}

function required<T>(rows: T[], what: string): T {
  if (!rows[0]) throw new NotFound(`${what} no longer exists.`);
  return rows[0];
}

export async function renameTemplate(db: Db, id: string, name: string) {
  const { rows } = await db.query("update templates set name = $2, updated_at = now() where id = $1 returning id", [id, name]);
  required(rows, "Template");
}

export async function renameSection(db: Db, id: string, name: string) {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ template_id: string }>(
      "update sections set name = $2 where id = $1 returning template_id",
      [id, name],
    );
    await touchTemplate(q, required(rows, "Section").template_id);
  });
}

export async function renameItem(db: Db, id: string, name: string) {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ template_id: string }>(
      `update items i set name = $2 from sections s
       where i.id = $1 and s.id = i.section_id returning s.template_id`,
      [id, name],
    );
    await touchTemplate(q, required(rows, "Item").template_id);
  });
}

export async function updateComment(
  db: Db,
  id: string,
  patch: { name?: string; textHtml?: string | null; commentType?: string },
) {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ template_id: string }>(
      `update comments c set
         name = case when $2 then $3 else c.name end,
         text_html = case when $4 then $5 else c.text_html end,
         comment_type = case when $6 then $7 else c.comment_type end
       from items i join sections s on s.id = i.section_id
       where c.id = $1 and i.id = c.item_id returning s.template_id`,
      [
        id,
        patch.name !== undefined,
        patch.name ?? "",
        patch.textHtml !== undefined,
        patch.textHtml ?? null,
        patch.commentType !== undefined,
        patch.commentType ?? null,
      ],
    );
    await touchTemplate(q, required(rows, "Comment").template_id);
  });
}

export async function revertComment(db: Db, id: string) {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ template_id: string; name: string; text_html: string | null }>(
      `update comments c set name = coalesce(c.imported_name, c.name), text_html = c.imported_text_html
       from items i join sections s on s.id = i.section_id
       where c.id = $1 and i.id = c.item_id and c.source_row_id is not null
       returning s.template_id, c.name, c.text_html`,
      [id],
    );
    const row = required(rows, "Comment");
    await touchTemplate(q, row.template_id);
    return { name: row.name, textHtml: row.text_html };
  });
}

export async function addComment(db: Db, itemId: string, commentType: string) {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; template_id: string }>(
      `insert into comments (item_id, position, name, comment_type, answer_type, text_html)
       select i.id,
              coalesce((select max(position) + 1 from comments where item_id = i.id), 0),
              'New comment', $2, 'boolean', ''
       from items i where i.id = $1
       returning id, (select template_id from sections s join items i2 on i2.section_id = s.id where i2.id = $1)`,
      [itemId, commentType],
    );
    const row = required(rows, "Item");
    await touchTemplate(q, row.template_id);
    return row.id;
  });
}

export async function deleteComment(db: Db, id: string) {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ template_id: string }>(
      `delete from comments c using items i, sections s
       where c.id = $1 and i.id = c.item_id and s.id = i.section_id returning s.template_id`,
      [id],
    );
    await touchTemplate(q, required(rows, "Comment").template_id);
  });
}

export async function copyTemplate(db: Db, id: string, name?: string): Promise<string> {
  const { rows: source } = await db.query<{ name: string }>("select name from templates where id = $1", [id]);
  const copyName = name ?? `${required(source, "Template").name} (copy)`;
  const { rows } = await db.query<{ id: string }>("select copy_template($1, $2) as id", [id, copyName]);
  return rows[0].id;
}

export async function deleteTemplate(db: Db, id: string) {
  const { rows } = await db.query("delete from templates where id = $1 returning id", [id]);
  required(rows, "Template");
}

export type ImportReport = {
  id: string;
  fileName: string;
  fileSha256: string;
  fileBytes: number;
  rowCount: number;
  stats: ImportStats;
  verification: Verification;
  createdAt: string;
  headers: string[];
  issues: (Issue & { id: string })[];
  rows: (StoredSourceRow & { disposition: Disposition })[];
};

export async function getSourceRows(q: Queryable, runId: string): Promise<StoredSourceRow[]> {
  const { rows } = await q.query<{ id: string; row_number: number; cells: Record<string, string>; disposition: Disposition }>(
    "select id, row_number, cells, disposition from import_source_rows where import_run_id = $1 order by row_number",
    [runId],
  );
  return rows.map((r) => ({ id: r.id, rowNumber: r.row_number, cells: r.cells, disposition: r.disposition }));
}

export async function getImportReport(q: Queryable, runId: string): Promise<ImportReport | null> {
  const { rows } = await q.query<{
    id: string;
    file_name: string;
    file_sha256: string;
    file_bytes: number;
    row_count: number;
    stats: ImportStats;
    verification: Verification;
    created_at: Date | string;
    headers: string[];
  }>("select * from import_runs where id = $1", [runId]);
  const run = rows[0];
  if (!run) return null;

  const issues = await q.query<{
    id: string;
    row_number: number | null;
    severity: Issue["severity"];
    origin: Issue["origin"];
    code: string;
    message: string;
    detail: string | null;
  }>("select * from import_issues where import_run_id = $1 order by row_number nulls first, code", [runId]);

  return {
    id: run.id,
    fileName: run.file_name,
    fileSha256: run.file_sha256,
    fileBytes: run.file_bytes,
    rowCount: run.row_count,
    stats: run.stats,
    verification: run.verification,
    createdAt: new Date(run.created_at).toISOString(),
    headers: run.headers,
    issues: issues.rows.map((i) => ({
      id: i.id,
      rowNumber: i.row_number,
      severity: i.severity,
      origin: i.origin,
      code: i.code,
      message: i.message,
      detail: i.detail ?? undefined,
    })),
    rows: await getSourceRows(q, runId),
  };
}
