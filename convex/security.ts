import { v } from "convex/values";
import { mutation, serverOnly, audit } from "./model";
import { metadata } from "./schema";

export const attempt = mutation({
  args: {
    key: v.string(),
    bucket: v.string(),
    limit: v.number(),
    windowMs: v.number(),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", a.bucket))
      .unique();
    if (a.reset) {
      if (row) await ctx.db.delete(row._id);
      return true;
    }
    const now = Date.now();
    if (row && row.resetAt > now) {
      if (row.count >= a.limit) return false;
      await ctx.db.patch(row._id, { count: row.count + 1 });
      return true;
    }
    if (row)
      await ctx.db.patch(row._id, { count: 1, resetAt: now + a.windowMs });
    else
      await ctx.db.insert("rateLimits", {
        key: a.bucket,
        count: 1,
        resetAt: now + a.windowMs,
      });
    const expired = await ctx.db
      .query("rateLimits")
      .withIndex("by_expiry", (q) => q.lte("resetAt", now))
      .take(20);
    for (const item of expired) await ctx.db.delete(item._id);
    return true;
  },
});
export const recordAudit = mutation({
  args: {
    key: v.string(),
    actorType: v.union(
      v.literal("anonymous"),
      v.literal("staff"),
      v.literal("system"),
    ),
    actorId: v.optional(v.string()),
    action: v.string(),
    objectType: v.string(),
    objectId: v.optional(v.string()),
    requestId: v.optional(v.string()),
    metadata: v.optional(metadata),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { key: _, ...input } = a;
    await audit(ctx, input);
  },
});
