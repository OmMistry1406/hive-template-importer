import Link from "next/link";
import { CopyTemplateButton, DeleteTemplateButton } from "@/components/TemplateButtons";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates(await getDb());
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <Link href="/import" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Import template</Link>
      </div>
      {templates.length === 0 ? (
        <p className="mt-6 text-muted">No templates yet. Import one to begin.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/templates/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                <p className="text-sm text-muted">
                  {t.sectionCount} sections, {t.commentCount} comments
                  {t.copiedFromName && `, copied from ${t.copiedFromName}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CopyTemplateButton templateId={t.id} />
                <DeleteTemplateButton templateId={t.id} name={t.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
