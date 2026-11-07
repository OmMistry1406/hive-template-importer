export type AuthConfig = { username: string; password: string; secret: string };

const LOCAL_DEFAULTS: AuthConfig = {
  username: "reviewer",
  password: "local-demo-password",
  secret: "local-development-secret-not-for-production",
};

// Local runs work out of the box. A deployment without real values must not
// fall back to known defaults, so it returns null and nobody can sign in.
export function authConfig(): AuthConfig | null {
  const username = process.env.DEMO_USERNAME;
  const password = process.env.DEMO_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (username && password && secret && secret.length >= 32) return { username, password, secret };
  if (process.env.VERCEL) return null;
  return LOCAL_DEFAULTS;
}
