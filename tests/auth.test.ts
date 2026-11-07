import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  credentialsMatch,
  safeNextPath,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "a-test-secret-that-is-long-enough-123";
const NOW = 1_800_000_000;

describe("session tokens", () => {
  it("accepts a token it issued", async () => {
    const token = await createSessionToken("reviewer", SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + 60)).toBe("reviewer");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken("reviewer", "another-secret-that-is-also-long-0000", NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a token whose user or expiry was edited", async () => {
    const [, expires, signature] = (await createSessionToken("reviewer", SECRET, NOW)).split(".");
    expect(await verifySessionToken(`admin.${expires}.${signature}`, SECRET, NOW)).toBeNull();
    expect(await verifySessionToken(`reviewer.${Number(expires) + 9999}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken("reviewer", SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + SESSION_TTL_SECONDS + 1)).toBeNull();
  });

  it.each([undefined, "", "garbage", "a.b", "a.b.c.d"])("rejects malformed token %j", async (token) => {
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });
});

describe("credentials", () => {
  const expected = { username: "reviewer", password: "correct horse" };
  it("matches only the exact pair", async () => {
    expect(await credentialsMatch({ username: "reviewer", password: "correct horse" }, expected)).toBe(true);
    expect(await credentialsMatch({ username: "reviewer", password: "correct hors" }, expected)).toBe(false);
    expect(await credentialsMatch({ username: "Reviewer", password: "correct horse" }, expected)).toBe(false);
    expect(await credentialsMatch({ username: "", password: "" }, expected)).toBe(false);
  });
});

describe("redirect after sign-in", () => {
  it.each([
    ["/templates/abc", "/templates/abc"],
    ["/import?x=1", "/import?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["", "/"],
    [null, "/"],
  ])("%j goes to %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});
