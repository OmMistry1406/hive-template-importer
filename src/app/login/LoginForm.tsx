"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { login } from "./actions";

const input = "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium">
        Username
        <input name="username" autoComplete="username" required className={input} />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-md bg-defect-soft px-3 py-2 text-sm text-defect">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />} Sign in
      </button>
    </form>
  );
}
