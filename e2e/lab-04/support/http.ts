import { API_URL, type Session } from "./env";

// Plain fetch calls to the API, usable from global setup (no Playwright fixtures there) and from
// tests. Nothing here prints a cookie, a password, or a response body that could hold one.

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

export async function call<T = any>(
  method: string, path: string, opts: { cookie?: string; body?: unknown } = {}
): Promise<{ status: number; body: T; setCookie: string[] }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, setCookie: res.headers.getSetCookie() };
}

/** Calls the API and fails with the method, path, status, and the API's own safe error text. */
export async function expectOk<T = any>(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}, okStatus = [200, 201]) {
  const res = await call<T>(method, path, opts);
  if (!okStatus.includes(res.status)) {
    const safe = (res.body as { error?: string; code?: string } | null) ?? {};
    throw new ApiError(`${method} ${path} answered ${res.status}${safe.code ? ` ${safe.code}` : ""}${safe.error ? `: ${safe.error}` : ""}`, res.status, res.body);
  }
  return res;
}

/** Signs in and returns the "name=value" session cookie and the user. */
export async function signIn(email: string, password: string) {
  const res = await expectOk<{ id: number; name: string; email: string; role: Session["role"]; mustChangePassword: boolean }>(
    "POST", "/api/auth/login", { body: { email, password } }, [200]
  );
  const cookie = res.setCookie.map(c => c.split(";")[0]).find(c => c.includes("="));
  if (!cookie) throw new Error(`POST /api/auth/login for ${email} returned no session cookie`);
  return { cookie, user: res.body };
}

/** The mandatory first password change through the API, then a fresh session with the new password. */
export async function changePasswordAndSignIn(email: string, current: string, next: string): Promise<Session> {
  const first = await signIn(email, current);
  if (!first.user.mustChangePassword) {
    throw new Error(`${email} was expected to need a password change (fresh database), but it does not`);
  }
  await expectOk("POST", "/api/auth/change-password", {
    cookie: first.cookie, body: { currentPassword: current, newPassword: next, confirmPassword: next },
  }, [200]);
  const second = await signIn(email, next);
  if (second.user.mustChangePassword) throw new Error(`${email} still needs a password change after changing it`);
  return { ...second.user, cookie: second.cookie, password: next };
}
