import { v } from "convex/values";
import { mutation, serverOnly, audit } from "./model";
import { role } from "./schema";

export const demo = mutation({
  args: {
    key: v.string(),
    accounts: v.array(
      v.object({
        id: v.string(),
        username: v.string(),
        displayName: v.string(),
        passwordHash: v.string(),
        roles: v.array(role),
      }),
    ),
    allDay: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    for (const account of a.accounts) {
      if (!account.passwordHash.startsWith("scrypt$16384$8$1$"))
        throw new Error("A supported password hash is required.");
      const existing = await ctx.db
        .query("staff")
        .withIndex("by_username", (q) => q.eq("username", account.username))
        .unique();
      if (existing)
        await ctx.db.patch(existing._id, {
          displayName: account.displayName,
          passwordHash: account.passwordHash,
          roles: account.roles,
          active: true,
          failedAttempts: 0,
          lockedUntil: undefined,
        });
      else
        await ctx.db.insert("staff", {
          ...account,
          active: true,
          failedAttempts: 0,
          createdAt: Date.now(),
        });
    }
    for (let weekday = 1; weekday <= (a.allDay ? 7 : 6); weekday++) {
      const existing = await ctx.db
        .query("schedules")
        .withIndex("by_weekday", (q) => q.eq("weekday", weekday))
        .first();
      if (!existing)
        await ctx.db.insert("schedules", {
          weekday,
          opensAt: a.allDay ? "00:00" : "08:00",
          closesAt: a.allDay
            ? "23:59"
            : weekday === 5
              ? "11:00"
              : weekday === 6
                ? "12:30"
                : "14:00",
          effectiveFrom: "2000-01-01",
        });
    }
    await audit(ctx, {
      actorType: "system",
      action: "demo.seeded",
      objectType: "evaluation_environment",
      metadata: { accountCount: a.accounts.length },
    });
    return { accounts: a.accounts.length };
  },
});
