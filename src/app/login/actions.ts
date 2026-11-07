"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth/config";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  credentialsMatch,
  safeNextPath,
} from "@/lib/auth/session";

export type LoginState = { error: string } | null;

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const config = authConfig();
  if (!config) return { error: "Sign-in is not configured on this server." };

  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };
  if (!(await credentialsMatch({ username, password }, config))) {
    return { error: "That username and password do not match." };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(username, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
