import { emptyVictimProfile, type VictimProfile } from "../victim";
import { randomBytes, randomUUID } from "node:crypto";
import { api, query, mutate, seal, unseal, BackendError } from "./convex";
import { isAiEnabled } from "./env";
import { modeCopy, type ServiceMode } from "../service-mode";
import { maskSensitiveText, type TranscriptMessage } from "../reports";
import { PRIVACY_NOTICE_VERSION, PRIVACY_PURPOSE } from "../privacy";
import type { ReporterSession } from "./session";
import type { StaffSession } from "./staff-auth";
import type { Doc } from "../../../convex/model";

export { BackendError as ReportServiceError };
export type ReportStatus = "submitted" | "under_review" | "decision_recorded";
export type Decision = "follow_up_required" | "follow_up_not_required";
export type DraftInput = {
  profile?: VictimProfile;
  victimName: string;
  victimNik: string;
  relation: string;
  story: string;
  incidentTime: string;
  incidentLocation: string;
  need: string;
  safeContact: "yes" | "no";
  contactDetails: string;
};
type ReportContent = {
  profile?: VictimProfile;
  story: string;
  incidentTime: string;
  incidentLocation: string;
  need: string;
  contactPreference: "yes" | "no";
};
export type OfficerReport = {
  profile?: VictimProfile;
  id: string;
  victimName: string;
  relation: string;
  received: string;
  receivedAt: string;
  status: ReportStatus;
  statusLabel: string;
  mode: ServiceMode;
  modeLabel: string;
  need: string;
  story: string;
  time: string;
  location: string;
  contact: string;
  decision?: Decision;
  reason?: string;
  decidedAt?: string;
};
export type RecapReport = Omit<
  OfficerReport,
  "received" | "mode" | "modeLabel" | "story"
> & { nikLast4: string | null };
export type RecapExportRow = {
  profile?: VictimProfile;
  contact?: string;
  id: string;
  receivedAt: string;
  victimName: string;
  nik: string;
  story: string;
  incidentTime: string;
  incidentLocation: string;
  contactPreference: string;
  decidedAt: string;
  relation: string;
  need: string;
  statusLabel: string;
  decisionLabel: string;
  reason: string;
};
type ReportRow = Omit<Doc<"reports">, "nik" | "contact">;
export function statusLabel(status: ReportStatus) {
  return status === "under_review"
    ? "Sedang diperiksa"
    : status === "decision_recorded"
      ? "Keputusan tercatat"
      : "Perlu diperiksa";
}
export function decisionLabel(decision?: Decision | null) {
  return decision === "follow_up_required"
    ? "Perlu tindak lanjut"
    : decision === "follow_up_not_required"
      ? "Tidak perlu tindak lanjut"
      : "Belum ada keputusan";
}
function relativeReceived(value: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Kemarin" : `${days} hari lalu`;
}
function mapOfficer(row: ReportRow, showSensitive = false): OfficerReport {
  const display = showSensitive ? (value: string) => value : maskSensitiveText;
  const content = JSON.parse(
    unseal(row.content, "report_content"),
  ) as ReportContent;
  return {
    id: row.referenceCode,
    victimName: unseal(row.name, "victim_name") || "Nama belum diisi",
    profile: content.profile,
    relation: unseal(row.relation, "relationship"),
    received: relativeReceived(row.submittedAt),
    receivedAt: new Date(row.submittedAt).toISOString(),
    status: row.status,
    statusLabel: statusLabel(row.status),
    mode: row.mode,
    modeLabel: modeCopy(row.mode, isAiEnabled()).label,
    need: display(content.need || "Belum diketahui"),
    story: display(content.story),
    time: display(content.incidentTime || "Belum diketahui"),
    location: display(content.incidentLocation || "Belum diketahui"),
    contact: row.safeContact ? "Aman dihubungi" : "Tidak aman dihubungi",
    decision: row.decision,
    reason: row.reason
      ? display(unseal(row.reason, "decision_reason"))
      : undefined,
    decidedAt: row.decidedAt
      ? new Date(row.decidedAt).toISOString()
      : undefined,
  };
}
function mapRecap(row: ReportRow): RecapReport {
  const {
    received: _,
    mode: __,
    modeLabel: ___,
    story: ____,
    ...mapped
  } = mapOfficer(row, true);
  return { ...mapped, nikLast4: row.nikLast4 ?? null };
}
export async function getOfficerReports(staff: StaffSession) {
  return (
    await query(api.reports.list, {
      staffSessionId: staff.sessionId,
      view: "inbox",
    })
  ).map(row => mapOfficer(row, staff.roles.includes("admin")));
}
export async function getOfficerReport(
  staff: StaffSession,
  referenceCode: string,
) {
  return mapOfficer(
    await query(api.reports.get, {
      staffSessionId: staff.sessionId,
      referenceCode,
    }),
    staff.roles.includes("admin"),
  );
}
export async function getRecapReports(staff: StaffSession) {
  return (
    await query(api.reports.list, {
      staffSessionId: staff.sessionId,
      view: "recap",
    })
  ).map(mapRecap);
}
export async function getReportTranscript(
  staff: StaffSession,
  referenceCode: string,
  requestId?: string | null,
) {
  const rows = await mutate(api.reports.transcript, {
    staffSessionId: staff.sessionId,
    referenceCode,
    requestId: requestId ?? undefined,
  });
  return {
    messages: rows.map((m): TranscriptMessage => ({
      id: m.id,
      sender: m.sender,
      source: m.source,
      body: staff.roles.includes("admin") ? unseal(m.body, "chat_message") : maskSensitiveText(unseal(m.body, "chat_message")),
      createdAt: new Date(m.createdAt).toISOString(),
    })),
  };
}
export async function createDraft(sessionId: string, content: DraftInput) {
  return mutate(api.reports.draft, {
    sessionId,
    id: randomUUID(),
    body: seal(content, "draft_content"),
  });
}
export async function submitReport(
  session: ReporterSession,
  input: { draftId: string; version: number; idempotencyKey: string },
  requestId?: string | null,
) {
  const draft = await query(api.reports.readDraft, {
    sessionId: session.id,
    draftId: input.draftId,
    version: input.version,
  });
  const content = JSON.parse(unseal(draft.body, "draft_content")) as DraftInput;
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
  })
    .format(new Date())
    .replaceAll("-", "");
  const result = await mutate(api.reports.submit, {
    draftId: input.draftId,
    version: input.version,
    idempotencyKey: input.idempotencyKey,
    sessionId: session.id,
    id: randomUUID(),
    referenceCode: `LA-${datePart}-${randomBytes(6).toString("hex").toUpperCase()}`,
    name: seal(content.victimName, "victim_name"),
    nik: content.victimNik ? seal(content.victimNik, "nik") : undefined,
    nikLast4: content.victimNik ? content.victimNik.slice(-4) : undefined,
    relation: seal(content.relation, "relationship"),
    content: seal(
      {
        story: content.story,
        incidentTime: content.incidentTime || "Belum diketahui",
        incidentLocation: content.incidentLocation || "Belum diketahui",
        need: content.need || "Belum diketahui",
        contactPreference: content.safeContact,
        profile: content.profile ?? emptyVictimProfile(),
      },
      "report_content",
    ),
    safeContact: content.safeContact === "yes",
    contact:
      content.safeContact === "yes" && content.contactDetails.trim()
        ? seal(content.contactDetails, "contact_details")
        : undefined,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    privacyPurpose: PRIVACY_PURPOSE,
    requestId: requestId ?? undefined,
  });
  return { ...result, submittedAt: new Date(result.submittedAt).toISOString() };
}
export async function saveReviewNote(
  staff: StaffSession,
  referenceCode: string,
  notes: string,
  requestId?: string | null,
) {
  return mutate(api.reports.review, {
    staffSessionId: staff.sessionId,
    referenceCode,
    notes: seal(notes, "review_notes"),
    requestId: requestId ?? undefined,
  });
}
export async function recordDecision(
  staff: StaffSession,
  referenceCode: string,
  decision: Decision,
  reason: string,
  requestId?: string | null,
) {
  const result = await mutate(api.reports.decide, {
    staffSessionId: staff.sessionId,
    referenceCode,
    decision,
    reason: seal(reason, "decision_reason"),
    requestId: requestId ?? undefined,
  });
  return {
    ...result,
    reason,
    decidedAt: new Date(result.decidedAt).toISOString(),
  };
}
async function identities(
  staff: StaffSession,
  purpose: "nik.view" | "recap.export",
  requestId?: string | null,
  referenceCode?: string,
) {
  if (!staff.roles.includes("admin"))
    throw new BackendError(
      403,
      purpose === "recap.export" ? "export_forbidden" : "nik_forbidden",
      "Akses hanya untuk akun admin.",
    );
  return mutate(api.reports.identities, {
    staffSessionId: staff.sessionId,
    referenceCode,
    purpose,
    requestId: requestId ?? undefined,
  });
}
export async function getReportNik(
  staff: StaffSession,
  referenceCode: string,
  requestId?: string | null,
) {
  const row = (
    await identities(staff, "nik.view", requestId, referenceCode)
  )[0];
  return { nik: row.nik ? unseal(row.nik, "nik") : null };
}
export async function getRecapExportRows(
  staff: StaffSession,
  requestId?: string | null,
): Promise<RecapExportRow[]> {
  return (await identities(staff, "recap.export", requestId)).map((row) => {
    const r = mapOfficer(row, true);
    const content = JSON.parse(unseal(row.content, "report_content")) as ReportContent;
    return {
      id: r.id,
      receivedAt: r.receivedAt,
      victimName: r.victimName,
      profile: r.profile,
      contact:
        row.safeContact && row.contact
          ? unseal(row.contact, "contact_details")
          : "",
      nik: row.nik ? unseal(row.nik, "nik") : "",
      story: content.story,
      incidentTime: content.incidentTime === 'Belum diketahui' ? '' : content.incidentTime,
      incidentLocation: content.incidentLocation === 'Belum diketahui' ? '' : content.incidentLocation,
      contactPreference: r.contact,
      decidedAt: r.decidedAt ?? '',
      relation: r.relation,
      need: content.need === "Belum diketahui" ? "" : content.need,
      statusLabel: r.statusLabel,
      decisionLabel: decisionLabel(r.decision),
      reason: r.reason ?? "",
    };
  });
}
export async function getOutboxSummary(staff: StaffSession) {
  return query(api.reports.outbox, { staffSessionId: staff.sessionId });
}
