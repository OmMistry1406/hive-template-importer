export const SESSION_COOKIE = "ti_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = `${encodeURIComponent(username)}.${nowSeconds + SESSION_TTL_SECONDS}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [user, expires, signature] = parts;
  if (!constantTimeEqual(signature, await sign(`${user}.${expires}`, secret))) return null;
  if (!(Number(expires) > nowSeconds)) return null;
  return decodeURIComponent(user);
}

export async function credentialsMatch(
  given: { username: string; password: string },
  expected: { username: string; password: string },
) {
  // Hashing first gives equal-length inputs, so the comparison time does not
  // reveal how much of a guess was right.
  const digest = async (s: string) => base64url(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const [gu, eu, gp, ep] = await Promise.all(
    [given.username, expected.username, given.password, expected.password].map(digest),
  );
  return constantTimeEqual(gu, eu) && constantTimeEqual(gp, ep);
}

// Only same-site paths, so the login form cannot be used to redirect elsewhere.
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
