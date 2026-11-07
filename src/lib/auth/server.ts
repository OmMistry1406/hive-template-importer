import "server-only";
import { cookies } from "next/headers";
import { authConfig } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function currentUser(): Promise<string | null> {
  const config = authConfig();
  if (!config) return null;
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, config.secret);
}
