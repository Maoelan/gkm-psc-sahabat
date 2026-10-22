import { v } from "convex/values";
import {
  mutation,
  query,
  serverOnly,
  reporter,
  appendMessage,
  messages,
  openHandoff,
  audit,
} from "./model";
import { sealed, sender, source } from "./schema";

export const history = query({
  args: {
    key: v.string(),
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const session = await reporter(ctx, a.sessionId);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session.id))
      .order("desc")
      .take(Math.min(Math.max(a.limit ?? 8, 1), 12));
    return rows.reverse();
  },
});
export const hasHandoff = query({
  args: { key: v.string(), sessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    return Boolean((await reporter(ctx, a.sessionId)).openHandoffId);
  },
});
export const saveTurn = mutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    user: v.optional(v.object({ id: v.string(), body: sealed })),
    assistant: v.object({ id: v.string(), body: sealed, sender, source }),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await reporter(ctx, a.sessionId);
    if (s.reportId) return { submitted: true, blocked: false };
    const h = await openHandoff(ctx, s);
    if (a.user)
      await appendMessage(ctx, s.id, {
        ...a.user,
        sender: "user",
        source: "user",
        handoffId: h?.id,
      });
    if (h) {
      await audit(ctx, {
        actorType: "anonymous",
        action: "chat.turn.handoff_paused",
        objectType: "chat_session",
        objectId: s.id,
        requestId: a.requestId,
      });
      return { blocked: true };
    }
    await appendMessage(ctx, s.id, a.assistant);
    await audit(ctx, {
      actorType: "anonymous",
      action: "chat.turn",
      objectType: "chat_session",
      objectId: s.id,
      requestId: a.requestId,
    });
    return { blocked: false };
  },
});
