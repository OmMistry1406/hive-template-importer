import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";
import { getDb } from "@/lib/db/client";
import { getTemplateTree } from "@/lib/db/templates";
import { sanitizeForDisplay } from "@/lib/import/html";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function TemplatePage({ params, searchParams }: PageProps<"/templates/[id]">) {
  const { id } = await params;
  const { comment } = await searchParams;
  if (!UUID.test(id)) notFound();
  const template = await getTemplateTree(await getDb(), id);
  if (!template) notFound();

  // Sanitised on the server so the client never handles unsafe imported HTML.
  const safe = {
    ...template,
    sections: template.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => ({
        ...i,
        comments: i.comments.map((c) => ({
          ...c,
          textHtml: c.textHtml ? sanitizeForDisplay(c.textHtml) : c.textHtml,
          edited: c.sourceRowId !== null && (c.textHtml !== c.importedTextHtml || c.name !== c.importedName),
          importedTextHtml: c.importedTextHtml ? sanitizeForDisplay(c.importedTextHtml) : c.importedTextHtml,
        })),
      })),
    })),
  };

  return <TemplateEditor key={template.id} template={safe} focusCommentId={typeof comment === "string" ? comment : undefined} />;
}
