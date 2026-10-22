import { v } from "convex/values";
import {
  mutation,
  query,
  serverOnly,
  audit,
  fail,
  staffMember,
  appendMessage,
} from "./model";
import { sealed } from "./schema";

export const find = query({
  args: { key: v.string(), username: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    return ctx.db
      .query("staff")
      .withIndex("by_username", (q) => q.eq("username", a.username))
      .unique();
  },
});
export const loginResult = mutation({
  args: {
    key: v.string(),
    staffId: v.string(),
    passwordHash: v.string(),
    success: v.boolean(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await ctx.db
      .query("staff")
      .withIndex("by_uuid", (q) => q.eq("id", a.staffId))
      .unique();
    if (
      !s?.active ||
      s.passwordHash !== a.passwordHash ||
      (s.lockedUntil ?? 0) > Date.now()
    )
      return false;
    if (a.success)
      await ctx.db.patch(s._id, { failedAttempts: 0, lockedUntil: undefined });
    else {
      const failedAttempts = s.lockedUntil ? 1 : s.failedAttempts + 1;
      await ctx.db.patch(s._id, {
        failedAttempts,
        lockedUntil: failedAttempts >= 5 ? Date.now() + 15 * 60_000 : undefined,
      });
    }
    await audit(ctx, {
      actorType: a.success ? "staff" : "anonymous",
      actorId: s.id,
      action: a.success ? "staff.login.succeeded" : "staff.login.failed",
      objectType: "staff_user",
      objectId: s.id,
      requestId: a.requestId,
    });
    return a.success;
  },
});
export const session = query({
  args: { key: v.string(), secretHash: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const session = await ctx.db
      .query("staffSessions")
      .withIndex("by_secret", (q) => q.eq("secretHash", a.secretHash))
      .unique();
    if (!session || session.revokedAt || session.expiresAt <= Date.now())
      return null;
    const s = await ctx.db
      .query("staff")
      .withIndex("by_uuid", (q) => q.eq("id", session.staffId))
      .unique();
    return s?.active
      ? {
          sessionId: session.id,
          staffId: s.id,
          username: s.username,
          displayName: s.displayName,
          roles: s.roles,
          csrfToken: session.csrfToken,
        }
      : null;
  },
});
export const createSession = mutation({
  args: {
    key: v.string(),
    id: v.string(),
    staffId: v.string(),
    secretHash: v.string(),
    csrfToken: v.string(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await staffMember(ctx, a.staffId, [
      "petugas",
      "admin",
      "bidan_pic",
      "auditor",
    ]);
    if ((s.lockedUntil ?? 0) > Date.now())
      fail(401, "login_locked", "Login belum dapat diproses.");
    const expiresAt = Date.now() + 8 * 60 * 60_000;
    await ctx.db.insert("staffSessions", {
      id: a.id,
      staffId: s.id,
      secretHash: a.secretHash,
      csrfToken: a.csrfToken,
      expiresAt,
    });
    await audit(ctx, {
      actorType: "staff",
      actorId: s.id,
      action: "staff.session.created",
      objectType: "staff_session",
      objectId: a.id,
      requestId: a.requestId,
    });
    return { id: a.id, csrfToken: a.csrfToken, expiresAt };
  },
});
export const logout = mutation({
  args: {
    key: v.string(),
    secretHash: v.string(),
    serviceMessage: v.object({ id: v.string(), body: sealed }),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await ctx.db
      .query("staffSessions")
      .withIndex("by_secret", (q) => q.eq("secretHash", a.secretHash))
      .unique();
    if (!s || s.revokedAt) return;
    await ctx.db.patch(s._id, { revokedAt: Date.now() });
    const handoffs = await ctx.db
      .query("handoffs")
      .withIndex("by_staff", (q) =>
        q.eq("claimedBy", s.staffId).eq("status", "active"),
      )
      .collect();
    for (const h of handoffs) {
      await ctx.db.patch(h._id, {
        status: "waiting",
        claimedBy: undefined,
        claimedAt: undefined,
      });
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_uuid", (q) => q.eq("id", h.sessionId))
        .unique();
      if (session?.status === "active" && session.expiresAt > Date.now())
        await appendMessage(ctx, session.id, {
          id: `${a.serviceMessage.id}-${h.id}`,
          body: a.serviceMessage.body,
          source: "handoff",
          sender: "service",
          handoffId: h.id,
        });
      await audit(ctx, {
        actorType: "staff",
        actorId: s.staffId,
        action: "chat.handoff.released",
        objectType: "chat_handoff",
        objectId: h.id,
        requestId: a.requestId,
      });
    }
    await audit(ctx, {
      actorType: "staff",
      actorId: s.staffId,
      action: "staff.logout",
      objectType: "staff_session",
      objectId: s.id,
      requestId: a.requestId,
    });
  },
});
