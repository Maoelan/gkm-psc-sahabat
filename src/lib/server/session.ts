import type { Cookies } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { secureCookies } from "./env";
import { hashSecret, randomToken } from "./crypto";
import { getServiceModeAt } from "./service-mode";
import type { ServiceMode } from "../service-mode";
import { api, query, mutate } from "./convex";

export const SESSION_COOKIE = "lapor_aman_session";
const SESSION_SECONDS = 2 * 60 * 60;
export type ReporterSession = {
  id: string;
  mode: ServiceMode;
  csrfToken: string;
  expiresAt: Date;
};
export async function createSession(
  cookies: Cookies,
  modeOverride?: ServiceMode,
) {
  const secret = randomToken(32);
  const result = await mutate(api.sessions.create, {
    id: randomUUID(),
    secretHash: hashSecret(secret),
    csrfToken: randomToken(24),
    mode: modeOverride ?? (await getServiceModeAt()),
  });
  cookies.set(SESSION_COOKIE, secret, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    maxAge: SESSION_SECONDS,
  });
  return { ...result, expiresAt: new Date(result.expiresAt) };
}
export async function requireSession(
  cookies: Cookies,
): Promise<ReporterSession | null> {
  const secret = cookies.get(SESSION_COOKIE);
  if (!secret) return null;
  const result = await query(api.sessions.get, {
    secretHash: hashSecret(secret),
  });
  return result ? { ...result, expiresAt: new Date(result.expiresAt) } : null;
}
export async function endSession(cookies: Cookies) {
  const secret = cookies.get(SESSION_COOKIE);
  try {
    if (secret)
      await mutate(api.sessions.end, { secretHash: hashSecret(secret) });
  } finally {
    cookies.delete(SESSION_COOKIE, { path: "/" });
  }
}
export function hasValidCsrf(request: Request, session: ReporterSession) {
  const token = request.headers.get("x-csrf-token");
  return Boolean(token) && token === session.csrfToken;
}
export { requestOriginAllowed } from "./request-security";
