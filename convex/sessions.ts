import { v } from "convex/values";
import { mutation, query, serverOnly, reporter } from "./model";
import { mode } from "./schema";

export const create = mutation({
  args: {
    key: v.string(),
    id: v.string(),
    secretHash: v.string(),
    csrfToken: v.string(),
    mode,
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const expiresAt = Date.now() + 2 * 60 * 60_000;
    await ctx.db.insert("sessions", {
      id: a.id,
      secretHash: a.secretHash,
      csrfToken: a.csrfToken,
      mode: a.mode,
      expiresAt,
      status: "active",
      createdAt: Date.now(),
      messageSeq: 0,
      draftVersion: 0,
    });
    return { id: a.id, mode: a.mode, csrfToken: a.csrfToken, expiresAt };
  },
});
export const get = query({
  args: { key: v.string(), secretHash: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_secret", (q) => q.eq("secretHash", a.secretHash))
      .unique();
    return s?.status === "active" && s.expiresAt > Date.now()
      ? {
          id: s.id,
          mode: s.mode,
          csrfToken: s.csrfToken,
          expiresAt: s.expiresAt,
          conversationEndedAt: s.conversationEndedAt,
        }
      : null;
  },
});
export const end = mutation({
  args: { key: v.string(), secretHash: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_secret", (q) => q.eq("secretHash", a.secretHash))
      .unique();
    if (!s) return;
    await ctx.db.patch(s._id, { status: "ended", openHandoffId: undefined });
    if (s.openHandoffId) {
      const h = await ctx.db
        .query("handoffs")
        .withIndex("by_uuid", (q) => q.eq("id", s.openHandoffId!))
        .unique();
      if (h)
        await ctx.db.patch(h._id, {
          status: "cancelled",
          closedAt: Date.now(),
          closeReason: "session_ended",
        });
    }
  },
});
export const schedule = query({
  args: { key: v.string(), weekday: v.number(), date: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_weekday", (q) =>
        q.eq("weekday", a.weekday).lte("effectiveFrom", a.date),
      )
      .order("desc")
      .collect();
    return {
      schedule:
        schedules.find((s) => !s.effectiveTo || s.effectiveTo >= a.date) ??
        null,
      exception: await ctx.db
        .query("exceptions")
        .withIndex("by_date", (q) => q.eq("date", a.date))
        .unique(),
    };
  },
});
export const health = query({
  args: { key: v.string() },
  handler: (_ctx, a) => {
    serverOnly(a.key);
    return { status: "ok" as const };
  },
});
