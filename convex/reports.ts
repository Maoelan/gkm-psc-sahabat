import { v } from "convex/values";
import {
  mutation,
  query,
  serverOnly,
  reporter,
  staffSession,
  fail,
  audit,
  messages,
  type QueryCtx,
} from "./model";
import { sealed, decision } from "./schema";

async function authorizedReport(
  ctx: QueryCtx,
  staffSessionId: string,
  referenceCode: string,
  adminOnly = false,
) {
  const staff = await staffSession(
    ctx,
    staffSessionId,
    adminOnly ? ["admin"] : ["admin", "petugas"],
  );
  const report = await ctx.db
    .query("reports")
    .withIndex("by_reference", (q) => q.eq("referenceCode", referenceCode))
    .unique();
  if (
    !report ||
    (!staff.roles.includes("admin") && report.assignedTo !== staff.id)
  )
    fail(
      404,
      "report_not_found",
      "Laporan tidak ditemukan dalam penugasan Anda.",
    );
  return { staff, report };
}
export const list = query({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    view: v.union(v.literal("inbox"), v.literal("recap")),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(
      ctx,
      a.staffSessionId,
      a.view === "recap" ? ["admin"] : ["petugas", "admin"],
    );
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_submitted")
      .order("desc")
      .collect();
    return rows
      .filter((r) => staff.roles.includes("admin") || r.assignedTo === staff.id)
      .map(({ nik: _, contact: __, ...r }) => r);
  },
});
export const get = query({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
    );
    const { nik: _, contact: __, ...result } = report;
    return result;
  },
});
export const notifications = query({
  args: { key: v.string(), staffSessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(ctx, a.staffSessionId, [
      "admin",
      "petugas",
    ]);
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_submitted")
      .order("desc")
      .collect();
    return rows
      .filter((r) => staff.roles.includes("admin") || r.assignedTo === staff.id)
      .map((r) => ({
        referenceCode: r.referenceCode,
        submittedAt: r.submittedAt,
      }));
  },
});
export const contact = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { staff, report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
    );
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: "report.contact.viewed",
      objectType: "report",
      objectId: report.referenceCode,
      requestId: a.requestId,
    });
    return report.safeContact ? (report.contact ?? null) : null;
  },
});
export const remove = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
    confirmation: v.string(),
    reason: sealed,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { staff, report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
      true,
    );
    if (a.confirmation !== report.referenceCode)
      fail(
        422,
        "confirmation_invalid",
        "Ketik kode laporan dengan tepat untuk menghapus.",
      );
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_uuid", (q) => q.eq("id", report.sessionId))
      .unique();
    if (session?.openHandoffId)
      fail(
        409,
        "handoff_open",
        "Tutup bantuan petugas sebelum menghapus laporan.",
      );
    const related = [
      ...(await ctx.db
        .query("messages")
        .withIndex("by_session", (q) => q.eq("sessionId", report.sessionId))
        .collect()),
      ...(await ctx.db
        .query("drafts")
        .withIndex("by_session", (q) => q.eq("sessionId", report.sessionId))
        .collect()),
      ...(await ctx.db
        .query("handoffs")
        .withIndex("by_session", (q) => q.eq("sessionId", report.sessionId))
        .collect()),
      ...(await ctx.db
        .query("assistance")
        .withIndex("by_session", (q) => q.eq("sessionId", report.sessionId))
        .collect()),
      ...(await ctx.db
        .query("reviews")
        .withIndex("by_report", (q) => q.eq("reportId", report.id))
        .collect()),
      ...(await ctx.db.query("outbox").collect()).filter(
        (r) => r.reportId === report.id,
      ),
    ];
    for (const row of related) await ctx.db.delete(row._id);
    if (session) await ctx.db.delete(session._id);
    await ctx.db.delete(report._id);
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: "report.deleted",
      objectType: "report",
      objectId: report.referenceCode,
      requestId: a.requestId,
      metadata: {
        deletedRecords: related.length + 1,
        encryptedReason: JSON.stringify(a.reason),
      },
    });
    return { deleted: true };
  },
});
export const identities = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.optional(v.string()),
    purpose: v.union(v.literal("nik.view"), v.literal("recap.export")),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const staff = await staffSession(ctx, a.staffSessionId, ["admin"]);
    const rows = a.referenceCode
      ? [
          (await authorizedReport(ctx, a.staffSessionId, a.referenceCode, true))
            .report,
        ]
      : await ctx.db
          .query("reports")
          .withIndex("by_submitted")
          .order("desc")
          .collect();
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: a.purpose,
      objectType: a.referenceCode ? "report" : "recap",
      objectId: a.referenceCode,
      requestId: a.requestId,
      metadata: { reportCount: rows.length },
    });
    return rows;
  },
});
export const transcript = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { staff, report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
    );
    const history = await messages(ctx, report.sessionId);
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: "report.chat_transcript.viewed",
      objectType: "report",
      objectId: a.referenceCode,
      requestId: a.requestId,
      metadata: { messageCount: history.length },
    });
    return history;
  },
});
export const draft = mutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    id: v.string(),
    body: sealed,
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await reporter(ctx, a.sessionId);
    if (s.reportId)
      fail(409, "report_already_submitted", "Laporan sudah dikirim.");
    const version = s.draftVersion + 1;
    await ctx.db.insert("drafts", {
      id: a.id,
      sessionId: s.id,
      body: a.body,
      version,
      status: "ready_for_confirmation",
      expiresAt: Date.now() + 30 * 24 * 60 * 60_000,
    });
    await ctx.db.patch(s._id, { draftVersion: version });
    return { draftId: a.id, version };
  },
});
export const readDraft = query({
  args: {
    key: v.string(),
    sessionId: v.string(),
    draftId: v.string(),
    version: v.number(),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    await reporter(ctx, a.sessionId);
    const d = await ctx.db
      .query("drafts")
      .withIndex("by_uuid", (q) => q.eq("id", a.draftId))
      .unique();
    if (
      !d ||
      d.sessionId !== a.sessionId ||
      d.version !== a.version ||
      d.expiresAt <= Date.now()
    )
      fail(
        422,
        "draft_not_found",
        "Draf tidak ditemukan. Simpan ulang draf Anda.",
      );
    return d;
  },
});
export const submit = mutation({
  args: {
    key: v.string(),
    sessionId: v.string(),
    draftId: v.string(),
    version: v.number(),
    idempotencyKey: v.string(),
    id: v.string(),
    referenceCode: v.string(),
    name: sealed,
    nik: v.optional(sealed),
    nikLast4: v.optional(v.string()),
    relation: sealed,
    content: sealed,
    safeContact: v.boolean(),
    contact: v.optional(sealed),
    privacyNoticeVersion: v.string(),
    privacyPurpose: v.string(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const s = await reporter(ctx, a.sessionId);
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", a.idempotencyKey),
      )
      .unique();
    if (existing) {
      if (existing.sessionId !== s.id)
        fail(409, "idempotency_conflict", "Kunci pengiriman sudah digunakan.");
      return {
        referenceCode: existing.referenceCode,
        submittedAt: existing.submittedAt,
      };
    }
    if (s.openHandoffId)
      fail(
        409,
        "handoff_open",
        "Selesaikan percakapan dengan petugas sebelum mengirim laporan.",
      );
    if (s.mode === "unavailable")
      fail(
        409,
        "service_unavailable",
        "Layanan sedang tidak tersedia. Draf tetap tersimpan.",
      );
    const d = await ctx.db
      .query("drafts")
      .withIndex("by_uuid", (q) => q.eq("id", a.draftId))
      .unique();
    if (
      !d ||
      d.sessionId !== s.id ||
      d.version !== a.version ||
      d.expiresAt <= Date.now()
    )
      fail(
        422,
        "draft_not_found",
        "Draf tidak ditemukan. Simpan ulang draf Anda.",
      );
    if (d.status === "confirmed" || s.reportId) {
      const prior = await ctx.db
        .query("reports")
        .withIndex("by_session", (q) => q.eq("sessionId", s.id))
        .unique();
      if (prior)
        return {
          referenceCode: prior.referenceCode,
          submittedAt: prior.submittedAt,
        };
      fail(409, "report_already_submitted", "Laporan sudah dikirim.");
    }
    if (
      await ctx.db
        .query("reports")
        .withIndex("by_reference", (q) =>
          q.eq("referenceCode", a.referenceCode),
        )
        .unique()
    )
      fail(
        409,
        "reference_conflict",
        "Kode laporan sedang dipakai. Coba lagi.",
      );
    const staff = (await ctx.db.query("staff").collect())
      .filter((x) => x.active && x.roles.includes("petugas"))
      .sort((x, y) => x.createdAt - y.createdAt)[0];
    const submittedAt = Date.now();
    await ctx.db.insert("reports", {
      id: a.id,
      referenceCode: a.referenceCode,
      sessionId: s.id,
      draftId: d.id,
      version: d.version,
      idempotencyKey: a.idempotencyKey,
      status: "submitted",
      submittedAt,
      mode: s.mode,
      name: a.name,
      nik: a.nik,
      nikLast4: a.nikLast4,
      relation: a.relation,
      content: a.content,
      safeContact: a.safeContact,
      contact: a.contact,
      assignedTo: staff?.id,
      privacyNoticeVersion: a.privacyNoticeVersion,
      privacyPurpose: a.privacyPurpose,
    });
    await ctx.db.patch(d._id, { status: "confirmed" });
    await ctx.db.patch(s._id, { reportId: a.id });
    await ctx.db.insert("outbox", {
      reportId: a.id,
      eventType: "report.submitted",
      status: "pending",
      createdAt: submittedAt,
    });
    await audit(ctx, {
      actorType: "anonymous",
      action: "report.submitted",
      objectType: "report",
      objectId: a.referenceCode,
      requestId: a.requestId,
      metadata: { mode: s.mode },
    });
    return { referenceCode: a.referenceCode, submittedAt };
  },
});
export const review = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
    notes: sealed,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { staff, report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
    );
    if (report.decision)
      fail(409, "already_decided", "Keputusan sudah tercatat.");
    await ctx.db.insert("reviews", {
      reportId: report.id,
      staffId: staff.id,
      body: a.notes,
      createdAt: Date.now(),
    });
    await ctx.db.patch(report._id, { status: "under_review" });
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: "report.review.saved",
      objectType: "report",
      objectId: report.referenceCode,
      requestId: a.requestId,
    });
    return { status: "under_review" as const };
  },
});
export const decide = mutation({
  args: {
    key: v.string(),
    staffSessionId: v.string(),
    referenceCode: v.string(),
    decision,
    reason: sealed,
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    const { staff, report } = await authorizedReport(
      ctx,
      a.staffSessionId,
      a.referenceCode,
    );
    if (report.decision)
      fail(
        409,
        "already_decided",
        "Keputusan sudah tercatat. Perubahan memerlukan alur koreksi terpisah.",
      );
    const decidedAt = Date.now();
    await ctx.db.patch(report._id, {
      status: "decision_recorded",
      decision: a.decision,
      reason: a.reason,
      decidedBy: staff.id,
      decidedAt,
    });
    await audit(ctx, {
      actorType: "staff",
      actorId: staff.id,
      action: "report.decision.recorded",
      objectType: "report",
      objectId: report.referenceCode,
      requestId: a.requestId,
      metadata: { decision: a.decision },
    });
    return { decision: a.decision, decidedAt };
  },
});
export const outbox = query({
  args: { key: v.string(), staffSessionId: v.string() },
  handler: async (ctx, a) => {
    serverOnly(a.key);
    await staffSession(ctx, a.staffSessionId, ["admin"]);
    return {
      pending: (await ctx.db.query("outbox").collect()).length,
      sent: 0,
      failed: 0,
      provider: "outbox",
    };
  },
});
