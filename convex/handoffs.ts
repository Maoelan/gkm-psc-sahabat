import { v } from "convex/values";
import {
  query,
  mutation,
  serverOnly,
  reporter,
  staffSession,
  openHandoff,
  messages,
  appendMessage,
  audit,
  fail,
  requireOpenConversation,
  type QueryCtx,
} from "./model";
import { sealed } from "./schema";

const message = v.object({ id: v.string(), body: sealed });
async function thread(
  ctx: QueryCtx,
  staffSessionId: string,
  handoffId: string,
  allowWaiting = false,
) {
  const staff = await staffSession(ctx, staffSessionId);
  const h = await ctx.db
    .query("handoffs")
    .withIndex("by_uuid", (q) => q.eq("id", handoffId))
    .unique();
  if (!h) fail(404, "handoff_not_found", "Percakapan tidak ditemukan.");
  const session = await reporter(ctx, h.sessionId);
  if (!allowWaiting && h.status === "waiting")
    fail(
      409,
      "handoff_not_claimed",
      "Ambil percakapan sebelum membuka transkrip.",
    );
  if (
    !allowWaiting &&
    !staff.roles.includes("admin") &&
    h.claimedBy !== staff.id
  )
    fail(403, "handoff_forbidden", "Percakapan sedang ditangani petugas lain.");
  return { staff, h, session };
}
export const reporterSnapshot = query({
  args: { key: v.string(), sessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const session = await reporter(ctx, a.sessionId);
    const h = await ctx.db
      .query("handoffs")
      .withIndex("by_session", (q) => q.eq("sessionId", session.id))
      .order("desc")
      .first();
    const history = await messages(ctx, session.id);
    const assistance = await ctx.db
      .query("assistance")
      .withIndex("by_session", (q) => q.eq("sessionId", session.id))
      .unique();
    return { session, handoff: h, messages: history, assistance };
  },
});
export const staffSnapshot = query({
  args: { key: v.string(), staffSessionId: v.string(), handoffId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { session, h } = await thread(ctx, a.staffSessionId, a.handoffId);
    const owner = h.claimedBy
      ? await ctx.db
          .query("staff")
          .withIndex("by_uuid", (q) => q.eq("id", h.claimedBy!))
          .unique()
      : null;
    return {
      session,
      handoff: h,
      claimedByName: owner?.displayName ?? null,
      messages: await messages(ctx, session.id),
      assistance: await ctx.db
        .query("assistance")
        .withIndex("by_session", (q) => q.eq("sessionId", session.id))
        .unique(),
    };
  },
});
export const queue = query({
  args: { key: v.string(), staffSessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(ctx, a.staffSessionId);
    const rows = [
      ...(await ctx.db
        .query("handoffs")
        .withIndex("by_status", (q) => q.eq("status", "waiting"))
        .collect()),
      ...(await ctx.db
        .query("handoffs")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect()),
    ];
    const result = [];
    for (const h of rows) {
      if (
        h.status === "active" &&
        h.claimedBy !== staff.id &&
        !staff.roles.includes("admin")
      )
        continue;
      const s = await ctx.db
        .query("sessions")
        .withIndex("by_uuid", (q) => q.eq("id", h.sessionId))
        .unique();
      if (!s || s.status !== "active" || s.expiresAt <= Date.now()) continue;
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_handoff", (q) => q.eq("handoffId", h.id))
        .collect();
      const owner = h.claimedBy
        ? await ctx.db
            .query("staff")
            .withIndex("by_uuid", (q) => q.eq("id", h.claimedBy!))
            .unique()
        : null;
      result.push({
        ...h,
        claimedByName: owner?.displayName ?? null,
        messageCount: msgs.length,
        lastMessageAt: msgs.at(-1)?.createdAt ?? null,
      });
    }
    return result.sort(
      (x, y) =>
        Number(x.status !== "waiting") - Number(y.status !== "waiting") ||
        x.requestedAt - y.requestedAt,
    );
  },
});
export const active = query({
  args: { key: v.string(), staffSessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(ctx, a.staffSessionId);
    if (!staff.roles.includes("admin")) return [];
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const result = [];
    for (const s of sessions) {
      if (s.expiresAt <= Date.now() || s.openHandoffId || s.reportId || s.conversationEndedAt) continue;
      const msgs = (await messages(ctx, s.id)).filter(
        (m) => m.sender === "user",
      );
      const last = msgs.at(-1);
      if (!last) continue;
      result.push({ session: s, lastMessage: last, messageCount: msgs.length });
    }
    return result
      .sort((x, y) => y.lastMessage.createdAt - x.lastMessage.createdAt)
      .slice(0, 20);
  },
});
export const request = mutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    id: v.string(),
    message,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await reporter(ctx, a.sessionId);
    requireOpenConversation(s);
    if (s.reportId)
      fail(409, "report_already_submitted", "Laporan sudah dikirim.");
    const existing = await openHandoff(ctx, s);
    if (existing) return { handoff: existing, message: null };
    const h = {
      id: a.id,
      sessionId: s.id,
      status: "waiting" as const,
      requestedAt: Date.now(),
    };
    await ctx.db.insert("handoffs", h);
    await ctx.db.patch(s._id, { openHandoffId: h.id });
    const msg = await appendMessage(ctx, s.id, {
      ...a.message,
      source: "handoff",
      sender: "service",
      handoffId: h.id,
    });
    await audit(ctx, {
      actorType: "anonymous",
      action: "chat.handoff.requested",
      objectType: "chat_handoff",
      objectId: h.id,
      requestId: a.requestId,
    });
    return { handoff: h, message: msg };
  },
});
export const claim = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    handoffId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    id: v.string(),
    message,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(ctx, a.staffSessionId);
    let h = a.handoffId
      ? await ctx.db
          .query("handoffs")
          .withIndex("by_uuid", (q) => q.eq("id", a.handoffId!))
          .unique()
      : null;
    if (a.handoffId && !h)
      fail(404, "handoff_not_found", "Percakapan tidak ditemukan.");
    if (!h && (!a.sessionId || !staff.roles.includes("admin")))
      fail(
        403,
        "takeover_forbidden",
        "Ambil alih percakapan hanya untuk admin.",
      );
    const s = await reporter(ctx, h?.sessionId ?? a.sessionId!);
    requireOpenConversation(s);
    if (s.reportId)
      fail(409, "report_already_submitted", "Laporan sudah dikirim.");
    if (!h) {
      if (!(await messages(ctx, s.id)).some((m) => m.sender === "user"))
        fail(409, "chat_not_ready", "Percakapan belum memiliki pesan pelapor.");
      h = await openHandoff(ctx, s);
    }
    if (h?.status === "active" && h.claimedBy === staff.id)
      return { handoff: h, message: null, claimedByName: staff.displayName };
    if (h && h.status !== "waiting")
      fail(
        409,
        "handoff_already_claimed",
        "Percakapan sudah diambil petugas lain atau ditutup.",
      );
    const now = Date.now();
    const data = {
      id: h?.id ?? a.id,
      sessionId: s.id,
      status: "active" as const,
      requestedAt: h?.requestedAt ?? now,
      claimedBy: staff.id,
      claimedAt: now,
    };
    if (h) await ctx.db.patch(h._id, data);
    else await ctx.db.insert("handoffs", data);
    await ctx.db.patch(s._id, {
      openHandoffId: data.id,
      expiresAt: Math.max(s.expiresAt, now + 2 * 60 * 60_000),
    });
    const msg = await appendMessage(ctx, s.id, {
      ...a.message,
      source: "handoff",
      sender: "service",
      handoffId: data.id,
    });
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: h ? "chat.handoff.claimed" : "chat.handoff.staff_takeover",
      objectType: "chat_handoff",
      objectId: data.id,
      requestId: a.requestId,
    });
    return { handoff: data, message: msg, claimedByName: staff.displayName };
  },
});
export const send = mutation({
  args: {
    key: v.string(),
    sessionId: v.optional(v.string()),
    staffSessionId: v.optional(v.string()),
    handoffId: v.optional(v.string()),
    message,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    let sessionId: string;
    let handoffId: string;
    let staffId: string | undefined;
    if (a.staffSessionId) {
      const { session, h, staff } = await thread(
        ctx,
        a.staffSessionId,
        a.handoffId ?? "",
      );
      if (h.status !== "active")
        fail(409, "handoff_not_active", "Percakapan ini tidak aktif.");
      requireOpenConversation(session);
      sessionId = session.id;
      handoffId = h.id;
      staffId = staff.id;
    } else {
      const s = await reporter(ctx, a.sessionId ?? "");
      requireOpenConversation(s);
      const h = await openHandoff(ctx, s);
      if (!h)
        fail(
          409,
          "handoff_not_open",
          "Bantuan petugas sudah tidak aktif. Pesan belum terkirim.",
        );
      sessionId = s.id;
      handoffId = h.id;
    }
    const msg = await appendMessage(ctx, sessionId, {
      ...a.message,
      handoffId,
      staffId,
      source: staffId ? "staff" : "user",
      sender: staffId ? "staff" : "user",
    });
    if (staffId)
      await audit(ctx, {
        actorType: "staff",
        actorId: staffId,
        action: "staff.chat.replied",
        objectType: "chat_handoff",
        objectId: handoffId,
        requestId: a.requestId,
      });
    return msg;
  },
});
export const saveAssistance = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    handoffId: v.string(),
    revision: v.number(),
    content: sealed,
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { session, h } = await thread(ctx, a.staffSessionId, a.handoffId);
    if (h.status !== "active")
      fail(409, "handoff_not_active", "Percakapan sudah ditutup.");
    if (session.messageSeq !== a.revision)
      fail(409, "assistance_stale", "Ada pesan baru. Panduan akan diperbarui.");
    const prior = await ctx.db
      .query("assistance")
      .withIndex("by_session", (q) => q.eq("sessionId", session.id))
      .unique();
    const data = {
      sessionId: session.id,
      revision: a.revision,
      content: a.content,
      updatedAt: Date.now(),
    };
    if (prior) await ctx.db.patch(prior._id, data);
    else await ctx.db.insert("assistance", data);
  },
});
export const finish = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    handoffId: v.string(),
    revision: v.number(),
    endConversation: v.optional(v.boolean()),
    confirmed: v.optional(v.boolean()),
    content: sealed,
    message,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const isStaff = Boolean(a.staffSessionId);
    const s = isStaff
      ? (await thread(ctx, a.staffSessionId!, a.handoffId)).session
      : await reporter(ctx, a.sessionId ?? "");
    if (a.endConversation) {
      if (!a.staffSessionId) fail(403, "staff_forbidden", "Hanya admin dapat menghentikan percakapan pelapor.");
      await staffSession(ctx, a.staffSessionId, ["admin"]);
      if (!a.confirmed) fail(422, "confirmation_required", "Konfirmasi penghentian percakapan diperlukan.");
    }
    const h = await openHandoff(ctx, s);
    if (!h || h.id !== a.handoffId)
      fail(409, "handoff_not_open", "Tidak ada bantuan petugas yang aktif.");
    if (isStaff && h.status !== "active")
      fail(409, "handoff_not_active", "Percakapan ini tidak aktif.");
    if (s.messageSeq !== a.revision)
      fail(
        409,
        "assistance_stale",
        "Ada pesan baru. Coba akhiri bantuan kembali.",
      );
    const prior = await ctx.db
      .query("assistance")
      .withIndex("by_session", (q) => q.eq("sessionId", s.id))
      .unique();
    const data = {
      sessionId: s.id,
      revision: a.revision,
      content: a.content,
      updatedAt: Date.now(),
    };
    if (prior) await ctx.db.patch(prior._id, data);
    else await ctx.db.insert("assistance", data);
    const patch = {
      status: isStaff ? ("closed" as const) : ("cancelled" as const),
      closedAt: Date.now(),
      closeReason: isStaff
        ? ("staff_closed" as const)
        : ("reporter_cancelled" as const),
    };
    await ctx.db.patch(h._id, patch);
    await ctx.db.patch(s._id, { openHandoffId: undefined, ...(a.endConversation ? { conversationEndedAt: Date.now() } : {}) });
    const msg = await appendMessage(ctx, s.id, {
      ...a.message,
      source: "handoff",
      sender: "service",
      handoffId: h.id,
    });
    const staff = isStaff ? await staffSession(ctx, a.staffSessionId!) : null;
    await audit(ctx, {
      actorType: staff ? "staff" : "anonymous",
      actorId: staff?.id,
      action: a.endConversation ? "admin.chat.ended" : staff ? "staff.chat.closed" : "chat.handoff.cancelled",
      objectType: "chat_handoff",
      objectId: h.id,
      requestId: a.requestId,
    });
    return { handoff: { ...h, ...patch }, message: msg };
  },
});
