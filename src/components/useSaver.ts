"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult } from "@/app/actions";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; error: string; retry: () => void };

export function useSaver() {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const inFlight = useRef(0);

  const save = useCallback(async <T,>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    const attempt = async (): Promise<ActionResult<T>> => {
      inFlight.current++;
      setState({ kind: "saving" });
      let result: ActionResult<T>;
      try {
        result = await fn();
      } catch {
        result = { ok: false, error: "Could not reach the server. Try again." };
      }
      inFlight.current--;
      if (!result.ok) {
        setState({ kind: "failed", error: result.error, retry: () => void attempt() });
      } else if (inFlight.current === 0) {
        setState({ kind: "saved" });
      }
      return result;
    };
    return attempt();
  }, []);

  return { state, save };
}

export type Save = ReturnType<typeof useSaver>["save"];
