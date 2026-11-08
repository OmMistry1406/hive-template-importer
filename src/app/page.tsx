import { ArrowRight, ClipboardCheck, Copy, Database, FileUp, GitBranch, PencilLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/OmMistry1406/hive-template-importer";

const STEPS = [
  { icon: FileUp, title: "Import", text: "Upload Spectora's HTML Text export. Columns are matched by name, and the file type is read from its bytes." },
  { icon: ClipboardCheck, title: "Verify", text: "After saving, every field is read back from Postgres and compared with the original row. Any difference cancels the import." },
  { icon: PencilLine, title: "Edit", text: "Rename sections and items, and edit comments as formatted text. Each change is marked, with Restore original." },
  { icon: Copy, title: "Copy", text: "Duplicate a whole template in one database statement, then change the copy without touching the original." },
];

const FACTS = [
  { value: "392 / 392", label: "rows accounted for" },
  { value: "0", label: "differences after read-back" },
  { value: "43", label: "links kept intact" },
  { value: "83", label: "automated tests" },
];

const PRINCIPLES = [
  { icon: ShieldCheck, title: "Nothing dropped quietly", text: "Rows that cannot be placed are kept and shown. Gaps are labelled as missing from Spectora's file, or not supported here." },
  { icon: Database, title: "Structured, not a blob", text: "Templates, sections, items and comments in Postgres, with the original rows kept separately as proof." },
  { icon: GitBranch, title: "Honest failures", text: "Wrong files, damaged files and missing columns are refused with a reason, and nothing is saved." },
];

export default async function Home() {
  if (await currentUser()) {
    const [first] = await listTemplates(await getDb());
    redirect(first ? `/templates/${first.id}` : "/import");
  }

  return (
    <main className="flex-1">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-12 pt-14 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">Spectora to structured templates</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Four years of tuned templates, moved without retyping a word.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Inspectors switching software will not rebuild their templates. This importer brings a Spectora
            template across intact, proves nothing was lost, and lets them keep working on it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
              Sign in to explore <ArrowRight className="size-4" />
            </Link>
            <a href={REPO} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-5 py-2.5 font-medium hover:bg-background">
              View the code
            </a>
          </div>
          <p className="mt-3 text-sm text-muted">Reviewer sign-in details are in the submission email.</p>
        </div>
        <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <video
            className="aspect-[16/10] w-full bg-foreground"
            controls
            preload="metadata"
            poster="/media/walkthrough-poster.jpg"
            aria-label="Product walkthrough"
          >
            <source src="/media/walkthrough.mp4" type="video/mp4" />
          </video>
          <figcaption className="border-t border-line px-4 py-2 text-sm text-muted">
            Walkthrough, 6 minutes, AI-narrated: import, verification report, editing, copying and a failure case.
          </figcaption>
        </figure>
      </section>

      <section className="border-y border-line bg-surface">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label}>
              <dt className="text-sm text-muted">{f.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mx-auto max-w-6xl px-6 pb-6 text-xs text-muted">
          Measured on Spectora&apos;s InterNACHI Residential template, the sample committed in the repo.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon className="size-4" /></span>
                <span className="text-sm text-muted">Step {i + 1}</span>
              </div>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-2xl font-semibold tracking-tight">Built to be trusted</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="size-5 text-accent" />
              <p className="mt-2 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted">
          <span>Hive Inspect Forward Deployed Engineer assignment, by Om Umaraliya</span>
          <span>Next.js · Supabase Postgres · Vercel</span>
        </div>
      </footer>
    </main>
  );
}
