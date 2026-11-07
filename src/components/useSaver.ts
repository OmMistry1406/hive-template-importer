"use client";

import { useCallback, useState } from "react";
import type { ActionResult } from "@/app/actions";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; error: string; count: number; retry: () => void };

type Failure = { error: string; retry: () => void };
type Handlers<T> = { onSuccess?: (value: T) => void; onFailure?: () => void };

// Failures are tracked per change, so a later successful save cannot hide an
// earlier failed one. Retry re-runs the whole change, including its follow-up.
export function useSaver() {
  const [pending, setPending] = useState(0);
  const [failures, setFailures] = useState<ReadonlyMap<string, Failure>>(new Map());
  const [savedOnce, setSavedOnce] = useState(false);

  const save = useCallback(async function run<T>(
    key: string,
    fn: () => Promise<ActionResult<T>>,
    handlers: Handlers<T> = {},
  ): Promise<ActionResult<T>> {
    setPending((n) => n + 1);
    let result: ActionResult<T>;
    try {
      result = await fn();
    } catch {
      result = { ok: false, error: "Could not reach the server." };
    }
    setPending((n) => n - 1);
    setFailures((previous) => {
      const next = new Map(previous);
      if (result.ok) next.delete(key);
      else next.set(key, { error: result.error, retry: () => void run(key, fn, handlers) });
      return next;
    });
    if (result.ok) {
      setSavedOnce(true);
      handlers.onSuccess?.(result.value);
    } else {
      handlers.onFailure?.();
    }
    return result;
  }, []);

  const [first] = failures.values();
  const state: SaveState = first
    ? { kind: "failed", error: first.error, count: failures.size, retry: () => failures.forEach((f) => f.retry()) }
    : pending > 0
      ? { kind: "saving" }
      : savedOnce
        ? { kind: "saved" }
        : { kind: "idle" };

  return { state, save };
}

export type Save = ReturnType<typeof useSaver>["save"];
