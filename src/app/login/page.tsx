import { ClipboardCheck, Copy, FileUp, PencilLine } from "lucide-react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

const STEPS = [
  { icon: FileUp, title: "Import", text: "Upload a Spectora HTML Text export. Every row is checked after saving." },
  { icon: ClipboardCheck, title: "Review", text: "See where each row went, and what Spectora's file never contained." },
  { icon: PencilLine, title: "Edit", text: "Rename sections and items, and edit comments as formatted text." },
  { icon: Copy, title: "Copy", text: "Duplicate a template and change the copy without touching the original." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  if (await currentUser()) redirect(safeNextPath(typeof next === "string" ? next : ""));
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-6 py-12 md:grid-cols-[1.1fr_1fr]">
      <section>
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Spectora to structured templates</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bring a template across intact.</h1>
        <p className="mt-3 max-w-md text-muted">
          Inspectors spend years tuning their templates. This tool moves one out of Spectora without
          retyping, and shows proof that nothing was lost.
        </p>
        <ul className="mt-8 space-y-4">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-muted">Use the reviewer details from the submission email.</p>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </section>
    </main>
  );
}
