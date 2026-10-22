import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { convexTest } from "convex-test";
import type { Cookies } from "@sveltejs/kit";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { seal, unseal } from "../../src/lib/server/convex";
import * as sessions from "../../src/lib/server/session";
import * as auth from "../../src/lib/server/staff-auth";
import * as handoffs from "../../src/lib/server/handoffs";
import * as reports from "../../src/lib/server/reports";
import { hashPassword } from "../../src/lib/server/crypto";
import { allowAttempt } from "../../src/lib/server/rate-limit";
import { POST as turn } from "../../src/routes/api/chat/turn/+server";
import { DELETE as deleteReport } from "../../src/routes/api/staff/reports/[id]/+server";
import { emptyVictimProfile } from "../../src/lib/victim";

const transport = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = transport.query;
    mutation = transport.mutation;
  },
}));
const modules = import.meta.glob("../../convex/**/*.ts");
const serverKey = randomBytes(32).toString("base64url");
let t: ReturnType<typeof convexTest<typeof schema>>;
let staff: auth.StaffSession;
let staffCookies: Cookies;
const content = {
  victimName: "Pelapor Latihan",
  victimNik: "0000000000000001",
  relation: "Diri sendiri",
  story: "Keterangan sintetis untuk pengujian integrasi.",
  incidentTime: "Belum diketahui",
  incidentLocation: "Belum diketahui",
  need: "Pendampingan",
  safeContact: "no" as const,
  contactDetails: "",
};
function cookieJar() {
  const values = new Map<string, string>();
  return {
    get: (n: string) => values.get(n),
    set: (n: string, v: string) => values.set(n, v),
    delete: (n: string) => values.delete(n),
  } as unknown as Cookies;
}
async function reporter(mode: "ai" | "operator" = "ai") {
  const cookies = cookieJar();
  return { cookies, session: await sessions.createSession(cookies, mode) };
}
async function userMessage(sessionId: string) {
  await t.mutation(api.chat.saveTurn, {
    key: serverKey,
    sessionId,
    user: {
      id: randomUUID(),
      body: seal("Cerita sintetis di rumah.", "chat_message"),
    },
    assistant: {
      id: randomUUID(),
      body: seal("Kapan kira-kira kejadian itu terjadi?", "chat_message"),
      source: "fallback",
      sender: "service",
    },
  });
}
async function submitted() {
  const { session } = await reporter();
  const draft = await reports.createDraft(session.id, content);
  return reports.submitReport(session, {
    ...draft,
    idempotencyKey: randomUUID(),
  });
}
async function expire(table: "sessions" | "drafts", id: string) {
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query(table)
      .withIndex("by_uuid", (q) => q.eq("id", id))
      .unique();
    await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
  });
}
function deferredProvider() {
  let release!: (value: Response) => void;
  let started!: () => void;
  const pending = new Promise<void>((r) => {
    started = r;
  });
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("NVIDIA_API_KEY", "test-key");
  const provider = vi.fn(() => {
    started();
    return new Promise<Response>((r) => {
      release = r;
    });
  });
  vi.stubGlobal("fetch", provider);
  return {
    pending,
    provider,
    release: () =>
      release(
        Response.json({ choices: [{ message: { content: '{"fields":{}}' } }] }),
      ),
  };
}
beforeEach(async () => {
  vi.stubEnv("APPLICATION_SERVER_KEY", serverKey);
  vi.stubEnv("CONVEX_URL", "https://evaluation.convex.cloud");
  vi.stubEnv("REPORT_DATA_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("NIK_DATA_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("AI_ENABLED", "false");
  t = convexTest(schema, modules);
  transport.query.mockImplementation((ref, args) => t.query(ref, args));
  transport.mutation.mockImplementation((ref, args) => t.mutation(ref, args));
  const id = randomUUID();
  await t.mutation(api.seed.demo, {
    key: serverKey,
    accounts: [
      {
        id,
        username: "test",
        displayName: "Uji",
        passwordHash: hashPassword(randomUUID()),
        roles: ["admin", "petugas"],
      },
    ],
  });
  staffCookies = cookieJar();
  await auth.createStaffSession(staffCookies, id);
  staff = (await auth.getStaffSession(staffCookies))!;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Convex lifecycle", () => {
  it("persists optional victim details encrypted and returns them to authorized reviewers", async () => {
    const { session } = await reporter();
    const profile = {
      ...emptyVictimProfile(),
      address: "Alamat latihan privat",
      parentName: "Wali Latihan",
      birthDate: "2000-01-01",
      coordination: "Sudah",
      coordinationDetails: "Kepolisian",
      violenceTypes: ["physical"],
    };
    const draft = await reports.createDraft(session.id, {
      ...content,
      victimName: "",
      profile,
    });
    const report = await reports.submitReport(session, {
      ...draft,
      idempotencyKey: randomUUID(),
    });
    const result = await reports.getOfficerReport(staff, report.referenceCode);
    expect(result.profile).toEqual(profile);
    expect(result.victimName).toBe("Nama belum diisi");
    const stored = await t.run((ctx) => ctx.db.query("reports").collect());
    expect(JSON.stringify(stored)).not.toContain(profile.address);
  });
  it("requires admin, CSRF and an exact confirmation before deleting report data", async () => {
    const report = await submitted();
    const event = (token: string, confirmation: string) =>
      ({
        cookies: staffCookies,
        params: { id: report.referenceCode },
        locals: { requestId: randomUUID() },
        request: new Request(
          "http://localhost/api/staff/reports/" + report.referenceCode,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": token,
            },
            body: JSON.stringify({
              confirmation,
              reason: "Penghapusan data latihan.",
            }),
          },
        ),
      }) as Parameters<typeof deleteReport>[0];
    expect(
      (await deleteReport(event("wrong", report.referenceCode))).status,
    ).toBe(403);
    expect((await deleteReport(event(staff.csrfToken, "wrong"))).status).toBe(
      422,
    );
    const own = await t.run((ctx) =>
      ctx.db
        .query("staff")
        .withIndex("by_uuid", (q) => q.eq("id", staff.staffId))
        .unique(),
    );
    await t.run((ctx) => ctx.db.patch(own!._id, { roles: ["petugas"] }));
    expect(
      (await deleteReport(event(staff.csrfToken, report.referenceCode))).status,
    ).toBe(403);
    await t.run((ctx) =>
      ctx.db.patch(own!._id, { roles: ["petugas", "admin"] }),
    );
    expect(
      (await deleteReport(event(staff.csrfToken, report.referenceCode))).status,
    ).toBe(200);
  });
  it("removes linked identity, transcript, draft and notes while preserving unrelated reports and an encrypted audit reason", async () => {
    const { session, cookies } = await reporter();
    await userMessage(session.id);
    const draft = await reports.createDraft(session.id, content);
    const removed = await reports.submitReport(session, {
      ...draft,
      idempotencyKey: randomUUID(),
    });
    await reports.saveReviewNote(
      staff,
      removed.referenceCode,
      "Catatan privat latihan.",
    );
    const kept = await submitted();
    await t.mutation(api.reports.remove, {
      key: serverKey,
      staffSessionId: staff.sessionId,
      referenceCode: removed.referenceCode,
      confirmation: removed.referenceCode,
      reason: seal("Alasan privat latihan.", "deletion_reason"),
    });
    expect(await sessions.requireSession(cookies)).toBeNull();
    for (const table of [
      "messages",
      "drafts",
      "handoffs",
      "assistance",
    ] as const) {
      const rows = await t.run((ctx) => ctx.db.query(table).collect());
      expect(rows.some((r) => r.sessionId === session.id)).toBe(false);
    }
    expect(
      await t.run((ctx) => ctx.db.query("reviews").collect()),
    ).toHaveLength(0);
    const remaining = await reports.getRecapReports(staff);
    expect(remaining.map((r) => r.id)).toEqual([kept.referenceCode]);
    expect(
      (
        await t.query(api.reports.notifications, {
          key: serverKey,
          staffSessionId: staff.sessionId,
        })
      ).map((r) => r.referenceCode),
    ).toEqual([kept.referenceCode]);
    const audit = await t.run((ctx) => ctx.db.query("audit").collect());
    expect(audit.some((r) => r.action === "report.deleted")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("Alasan privat latihan.");
  });
  it("restricts notification metadata and contact reveal to the stored staff assignment", async () => {
    const report = await submitted();
    const owner = await t.run((ctx) =>
      ctx.db
        .query("staff")
        .withIndex("by_uuid", (q) => q.eq("id", staff.staffId))
        .unique(),
    );
    await t.run((ctx) => ctx.db.patch(owner!._id, { roles: ["petugas"] }));
    expect(
      await t.mutation(api.reports.contact, {
        key: serverKey,
        staffSessionId: staff.sessionId,
        referenceCode: report.referenceCode,
      }),
    ).toBeNull();
    const row = await t.run((ctx) =>
      ctx.db
        .query("reports")
        .withIndex("by_reference", (q) =>
          q.eq("referenceCode", report.referenceCode),
        )
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch(row!._id, { assignedTo: "another-staff" }),
    );
    expect(
      await t.query(api.reports.notifications, {
        key: serverKey,
        staffSessionId: staff.sessionId,
      }),
    ).toEqual([]);
    await expect(
      t.mutation(api.reports.contact, {
        key: serverKey,
        staffSessionId: staff.sessionId,
        referenceCode: report.referenceCode,
      }),
    ).rejects.toThrow("Laporan tidak ditemukan");
  });
  it("rejects direct backend access without the application server key", async () => {
    await expect(
      t.query(api.sessions.health, { key: "invalid" }),
    ).rejects.toThrow("Akses backend ditolak");
    await expect(
      t.query(api.reports.list, {
        key: "invalid",
        staffSessionId: staff.sessionId,
        view: "recap",
      }),
    ).rejects.toThrow("Akses backend ditolak");
  });
  it("does not create a reporter session when backend storage fails", async () => {
    transport.mutation.mockRejectedValueOnce(new Error("offline"));
    const cookies = cookieJar();
    await expect(sessions.createSession(cookies, "ai")).rejects.toMatchObject({
      status: 503,
    });
    expect(cookies.get(sessions.SESSION_COOKIE)).toBeUndefined();
  });
  it("shares rate limits between requests and resets after expiry", async () => {
    expect(await allowAttempt("test", 2, 1000)).toBe(true);
    expect(await allowAttempt("test", 2, 1000)).toBe(true);
    expect(await allowAttempt("test", 2, 1000)).toBe(false);
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("rateLimits").collect())
        await ctx.db.patch(r._id, { resetAt: Date.now() - 1 });
    });
    expect(await allowAttempt("test", 2, 1000)).toBe(true);
  });
  it("creates drafts with distinct versions", async () => {
    const { session } = await reporter();
    const drafts = await Promise.all([
      reports.createDraft(session.id, content),
      reports.createDraft(session.id, content),
    ]);
    expect(drafts.map((d) => d.version).sort()).toEqual([1, 2]);
  });
  it("rejects expired drafts, expired sessions and drafts belonging to another reporter", async () => {
    const first = await reporter();
    const second = await reporter();
    const draft = await reports.createDraft(first.session.id, content);
    await expect(
      reports.submitReport(second.session, {
        ...draft,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expire("drafts", draft.draftId);
    await expect(
      reports.submitReport(first.session, {
        ...draft,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expire("sessions", first.session.id);
    await expect(
      reports.createDraft(first.session.id, content),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("submits idempotently and rejects conflicting keys from other sessions", async () => {
    const { session } = await reporter();
    const draft = await reports.createDraft(session.id, content);
    const input = {
      ...draft,
      idempotencyKey: randomUUID(),
      privacyRead: true,
      noticeVersion: "2026-10-22",
    };
    const result = await reports.submitReport(session, input);
    expect(await reports.submitReport(session, input)).toEqual(result);
    const other = await reporter();
    const otherDraft = await reports.createDraft(other.session.id, content);
    await expect(
      reports.submitReport(other.session, {
        ...otherDraft,
        idempotencyKey: input.idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    const rows = await t.run((ctx) => ctx.db.query("reports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].content.encrypted).not.toContain(content.story);
    expect(await reports.getReportNik(staff, result.referenceCode)).toEqual({
      nik: content.victimNik,
    });
    expect(await reports.getOutboxSummary(staff)).toMatchObject({
      pending: 1,
      sent: 0,
      provider: "outbox",
    });
  });
  it("allows one final decision and records encrypted notes", async () => {
    const result = await submitted();
    await reports.saveReviewNote(
      staff,
      result.referenceCode,
      "Catatan sintetis.",
    );
    expect(
      (await reports.getOfficerReport(staff, result.referenceCode)).status,
    ).toBe("under_review");
    await reports.recordDecision(
      staff,
      result.referenceCode,
      "follow_up_required",
      "Alasan sintetis.",
    );
    await expect(
      reports.recordDecision(
        staff,
        result.referenceCode,
        "follow_up_not_required",
        "Ubah.",
      ),
    ).rejects.toMatchObject({ code: "already_decided" });
    await expect(
      reports.saveReviewNote(staff, result.referenceCode, "Tambahan."),
    ).rejects.toMatchObject({ status: 409 });
    expect((await reports.getRecapReports(staff))[0].decision).toBe(
      "follow_up_required",
    );
  });
  it("checks stored roles, assignments and account status instead of trusting caller claims", async () => {
    const result = await submitted();
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("staff")
        .withIndex("by_uuid", (q) => q.eq("id", staff.staffId))
        .unique();
      await ctx.db.patch(row!._id, { roles: ["bidan_pic"] });
    });
    await expect(reports.getRecapReports(staff)).rejects.toMatchObject({
      status: 403,
    });
    await expect(reports.getRecapExportRows(staff)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      reports.getReportNik(staff, result.referenceCode),
    ).rejects.toMatchObject({ status: 403 });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("staff")
        .withIndex("by_uuid", (q) => q.eq("id", staff.staffId))
        .unique();
      await ctx.db.patch(row!._id, { active: false });
    });
    expect(await auth.getStaffSession(staffCookies)).toBeNull();
  });
  it("invalidates staff sessions and releases handoffs atomically on logout", async () => {
    const { session } = await reporter();
    await userMessage(session.id);
    await handoffs.takeoverChatSession(staff, session.id);
    await auth.destroyStaffSession(staffCookies);
    expect(await auth.getStaffSession(staffCookies)).toBeNull();
    expect(
      (await handoffs.getReporterHandoff(session.id)).handoff?.status,
    ).toBe("waiting");
    await expect(handoffs.getStaffChatQueue(staff)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("denies another staff member access to assigned reports and active conversations", async () => {
    const result = await submitted();
    const outsiderId = randomUUID();
    await t.mutation(api.seed.demo, {
      key: serverKey,
      accounts: [
        {
          id: outsiderId,
          username: "other",
          displayName: "Petugas lain",
          passwordHash: hashPassword(randomUUID()),
          roles: ["petugas"],
        },
      ],
    });
    const cookies = cookieJar();
    await auth.createStaffSession(cookies, outsiderId);
    const outsider = (await auth.getStaffSession(cookies))!;
    expect(await reports.getOfficerReports(outsider)).toEqual([]);
    await expect(
      reports.getReportTranscript(outsider, result.referenceCode),
    ).rejects.toMatchObject({ status: 404 });
    const { session } = await reporter();
    await userMessage(session.id);
    const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
    await expect(
      handoffs.getStaffChatThread(outsider, handoff.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handoffs.getStaffChatAssistance(outsider, handoff.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handoffs.claimStaffChat(outsider, handoff.id),
    ).rejects.toMatchObject({ code: "handoff_already_claimed" });
    await expect(
      handoffs.takeoverChatSession(outsider, session.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("locks staff login after five failed attempts", async () => {
    for (let i = 0; i < 7; i++)
      expect(
        (
          await auth.authenticateStaff("test", "incorrect", {
            clientKey: "test",
          })
        ).ok,
      ).toBe(false);
    const account = await t.query(api.staff.find, {
      key: serverKey,
      username: "test",
    });
    expect(account!.failedAttempts).toBe(5);
    expect(account!.lockedUntil).toBeGreaterThan(Date.now());
  });
  it("blocks report submission while handoff is open, then includes the full transcript", async () => {
    const { session } = await reporter();
    await userMessage(session.id);
    const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
    const draft = await reports.createDraft(session.id, content);
    await expect(
      reports.submitReport(session, { ...draft, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "handoff_open" });
    await handoffs.sendStaffChatMessage(
      staff,
      handoff.id,
      "Keterangan tambahan apa yang ingin disampaikan?",
    );
    await handoffs.sendReporterHandoffMessage(
      session,
      "Tetangga mendengar kejadian tersebut.",
    );
    await handoffs.closeStaffChat(staff, handoff.id);
    const result = await reports.submitReport(session, {
      ...draft,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await reports.getReportTranscript(staff, result.referenceCode)
      ).messages.some((m) => m.body.includes("Tetangga mendengar")),
    ).toBe(true);
  });
  it("stores encrypted private guidance without sending messages", async () => {
    const { session } = await reporter();
    await userMessage(session.id);
    const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
    const before = await handoffs.getStaffChatThread(staff, handoff.id);
    const assistance = await handoffs.getStaffChatAssistance(staff, handoff.id);
    expect(assistance.fields.story.quote).toBe("Cerita sintetis di rumah.");
    expect(
      (await handoffs.getStaffChatThread(staff, handoff.id)).messages,
    ).toHaveLength(before.messages.length);
    expect(
      (await handoffs.getStaffChatAssistance(staff, handoff.id)).updatedAt,
    ).toBe(assistance.updatedAt);
    const row = (await t.run((ctx) => ctx.db.query("assistance").collect()))[0];
    expect(row.content.encrypted).not.toContain("Cerita");
    expect(JSON.parse(unseal(row.content, "staff_assistance"))).toEqual(
      assistance,
    );
  });
  it.each(["staff", "reporter"])(
    "preserves the last answer when %s ends assistance during provider work",
    async (closer) => {
      const { session } = await reporter();
      await userMessage(session.id);
      const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
      await handoffs.getStaffChatAssistance(staff, handoff.id);
      await handoffs.sendStaffChatMessage(
        staff,
        handoff.id,
        "Kapan kira-kira kejadian itu terjadi?",
      );
      await handoffs.sendReporterHandoffMessage(session, "Kemarin sore");
      const provider = deferredProvider();
      const result = handoffs.getStaffChatAssistance(staff, handoff.id);
      const assertion = expect(result).rejects.toMatchObject({
        code: "handoff_not_active",
      });
      await provider.pending;
      if (closer === "staff") await handoffs.closeStaffChat(staff, handoff.id);
      else await handoffs.cancelReporterHandoff(session);
      provider.release();
      await assertion;
      expect(
        (await handoffs.getReporterHandoff(session.id)).collectedFields
          .incidentTime,
      ).toBe("Kemarin sore");
    },
  );
  it("rejects stale provider results and redacts identity patterns in the provider request", async () => {
    const { session } = await reporter();
    await userMessage(session.id);
    const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
    await handoffs.sendReporterHandoffMessage(
      session,
      "Nama saya Ayu Lestari. NIK 0000000000000001.",
    );
    const provider = deferredProvider();
    const result = handoffs.getStaffChatAssistance(staff, handoff.id);
    const assertion = expect(result).rejects.toMatchObject({
      code: "assistance_stale",
    });
    await provider.pending;
    expect(JSON.stringify(provider.provider.mock.calls)).not.toMatch(
      /0000000000000001|Ayu Lestari/,
    );
    await handoffs.sendReporterHandoffMessage(
      session,
      "Ada keterangan tambahan.",
    );
    provider.release();
    await assertion;
    expect(
      await t.run((ctx) => ctx.db.query("assistance").collect()),
    ).toHaveLength(0);
  });
  it.each(["ai", "operator"] as const)(
    "answers service questions with AI and retained history in %s mode",
    async (mode) => {
      const { session, cookies } = await reporter(mode);
      await userMessage(session.id);
      vi.stubEnv("AI_ENABLED", "true");
      vi.stubEnv("NVIDIA_API_KEY", "test-key");
      const provider = vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply:
                    "Laporan dapat dibaca petugas yang ditugaskan dan admin.",
                  next_field: "incident_time",
                  question: "Kapan kira-kira kejadian itu terjadi?",
                  extracted_fields: {},
                }),
              },
            },
          ],
        }),
      );
      vi.stubGlobal("fetch", provider);
      const response = await turn({
        cookies,
        request: new Request("http://localhost/api/chat/turn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: JSON.stringify({
            story: content.story,
            userMessage: "Siapa yang bisa membaca laporan saya?",
          }),
        }),
        locals: { requestId: randomUUID() },
      } as Parameters<typeof turn>[0]);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        source: "nvidia",
        message: expect.stringContaining("admin"),
        fields: { incidentTime: "" },
      });
      expect(provider).toHaveBeenCalledOnce();
      const request = JSON.parse(
        (provider.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string,
      );
      expect(request.chat_template_kwargs.enable_thinking).toBe(false);
      expect(JSON.parse(request.messages[1].content).recent_messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            body: "Cerita sintetis di rumah.",
          }),
        ]),
      );
    },
  );
  it("does not call the public AI while staff assistance is active during service hours", async () => {
    const { session, cookies } = await reporter("operator");
    await userMessage(session.id);
    await handoffs.takeoverChatSession(staff, session.id);
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const response = await turn({
      cookies,
      request: new Request("http://localhost/api/chat/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session.csrfToken,
        },
        body: JSON.stringify({
          story: content.story,
          userMessage: "Ada keterangan tambahan.",
        }),
      }),
      locals: { requestId: randomUUID() },
    } as Parameters<typeof turn>[0]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "handoff_open",
      accepted: true,
    });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(["ai", "operator"] as const)(
    "does not save an AI response after the reporter ends a %s session",
    async (mode) => {
      const { session, cookies } = await reporter(mode);
      const provider = deferredProvider();
      const response = turn({
        cookies,
        request: new Request("http://localhost/api/chat/turn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: JSON.stringify({
            story: content.story,
            userMessage: content.story,
          }),
        }),
        locals: { requestId: randomUUID() },
      } as Parameters<typeof turn>[0]);
      await provider.pending;
      await sessions.endSession(cookies);
      provider.release();
      expect((await response).status).toBe(401);
      expect(
        await t.run((ctx) => ctx.db.query("messages").collect()),
      ).toHaveLength(0);
    },
  );
  it.each(["ai", "operator"] as const)(
    "forwards the reporter message when staff takes over during provider work in %s mode",
    async (mode) => {
      const { session, cookies } = await reporter(mode);
      await userMessage(session.id);
      const provider = deferredProvider();
      const response = turn({
        cookies,
        request: new Request("http://localhost/api/chat/turn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: JSON.stringify({
            story: content.story,
            userMessage: "Ada keterangan tambahan saat pengambilalihan.",
          }),
        }),
        locals: { requestId: randomUUID() },
      } as Parameters<typeof turn>[0]);
      await provider.pending;
      await handoffs.takeoverChatSession(staff, session.id);
      provider.release();
      const r = await response;
      expect(r.status).toBe(409);
      const body = await r.json();
      expect(body.accepted).toBe(true);
      expect(
        (await handoffs.getReporterHandoff(session.id)).messages.some(
          (m) =>
            m.id === body.userMessageId && m.body.includes("Ada keterangan"),
        ),
      ).toBe(true);
    },
  );
});
