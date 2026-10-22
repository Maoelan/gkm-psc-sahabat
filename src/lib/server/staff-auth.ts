import type { Cookies } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { secureCookies } from "./env";
import {
  hashPassword,
  hashSecret,
  randomToken,
  verifyPassword,
} from "./crypto";
import { recordAudit } from "./audit";
import { allowAttempt, resetAttempts } from "./rate-limit";
import { api, query, mutate, seal } from "./convex";

export const STAFF_COOKIE = "lapor_aman_staff";
const STAFF_SESSION_SECONDS = 8 * 60 * 60;
const dummyPasswordHash = hashPassword(randomToken(32));
export type StaffRole = "petugas" | "bidan_pic" | "admin" | "auditor";
export type StaffSession = {
  sessionId: string;
  staffId: string;
  username: string;
  displayName: string;
  roles: StaffRole[];
  csrfToken: string;
};
export async function getStaffSession(
  cookies: Cookies,
): Promise<StaffSession | null> {
  const secret = cookies.get(STAFF_COOKIE);
  if (!secret) return null;
  return query(api.staff.session, { secretHash: hashSecret(secret) });
}
export async function authenticateStaff(
  usernameValue: string,
  password: string,
  context: { requestId?: string | null; clientKey?: string | null } = {},
) {
  const username = usernameValue.trim().toLowerCase();
  if (!username || !password)
    return {
      ok: false as const,
      status: 422,
      message: "Nama pengguna dan kata sandi wajib diisi.",
    };
  const bucketKey = `staff-login:${hashSecret(context.clientKey ?? "unknown")}:${username}`;
  if (!(await allowAttempt(bucketKey, 8, 10 * 60_000)))
    return {
      ok: false as const,
      status: 429,
      message: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
    };
  const staff = await query(api.staff.find, { username });
  const matches = verifyPassword(
    password,
    staff?.passwordHash ?? dummyPasswordHash,
  );
  const generic = {
    ok: false as const,
    status: 401,
    message: "Nama pengguna atau kata sandi tidak cocok.",
  };
  if (!staff || !staff.active || (staff.lockedUntil ?? 0) > Date.now()) {
    await recordAudit({
      actorType: "anonymous",
      action: "staff.login.failed",
      objectType: "staff_user",
      requestId: context.requestId,
    });
    return generic;
  }
  const accepted = await mutate(api.staff.loginResult, {
    staffId: staff.id,
    passwordHash: staff.passwordHash,
    success: matches,
    requestId: context.requestId ?? undefined,
  });
  if (!accepted) return generic;
  await resetAttempts(bucketKey);
  return {
    ok: true as const,
    staff: {
      id: staff.id,
      username: staff.username,
      display_name: staff.displayName,
      roles: staff.roles,
    },
  };
}
export async function createStaffSession(
  cookies: Cookies,
  staffId: string,
  context: { requestId?: string | null } = {},
) {
  const secret = randomToken(32);
  const result = await mutate(api.staff.createSession, {
    id: randomUUID(),
    staffId,
    secretHash: hashSecret(secret),
    csrfToken: randomToken(24),
    requestId: context.requestId ?? undefined,
  });
  cookies.set(STAFF_COOKIE, secret, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    maxAge: STAFF_SESSION_SECONDS,
  });
  return { ...result, expiresAt: new Date(result.expiresAt) };
}
export async function destroyStaffSession(
  cookies: Cookies,
  requestId?: string | null,
) {
  const secret = cookies.get(STAFF_COOKIE);
  try {
    if (secret)
      await mutate(api.staff.logout, {
        secretHash: hashSecret(secret),
        requestId: requestId ?? undefined,
        serviceMessage: {
          id: randomUUID(),
          body: seal(
            "Petugas sebelumnya keluar dari sesi. Permintaan Anda menunggu petugas lain.",
            "chat_message",
          ),
        },
      });
  } finally {
    cookies.delete(STAFF_COOKIE, { path: "/" });
  }
}
export function hasStaffRole(staff: StaffSession, roles: StaffRole[]) {
  return staff.roles.some((role) => roles.includes(role));
}
export function hasStaffCsrfValue(
  staff: StaffSession,
  token: string | null | undefined,
) {
  return Boolean(token) && token === staff.csrfToken;
}
export function hasStaffCsrf(request: Request, staff: StaffSession) {
  return hasStaffCsrfValue(staff, request.headers.get("x-csrf-token"));
}
export function defaultStaffRoute(staff: StaffSession) {
  if (hasStaffRole(staff, ["admin"])) return "/rekap";
  if (hasStaffRole(staff, ["petugas"])) return "/petugas";
  return "/petugas/ganti-akun";
}
