import { randomUUID } from "node:crypto";
import { api, query, mutate, seal, unseal, BackendError } from "./convex";
import { recordAudit } from "./audit";
import { getServiceModeAt } from "./service-mode";
import { maskSensitiveText } from "../reports";
import type {
  ActiveConversation,
  HandoffQueueItem,
  HandoffThreadMessage,
  ReporterHandoff,
  StaffHandoff,
} from "../handoff";
import type { ReporterSession } from "./session";
import type { StaffSession } from "./staff-auth";
import { collectedChatFields, type StaffAssistance } from "../assistance";
import { finalizeStaffAssistance, makeStaffAssistance } from "./assistance-ai";
import type { Doc } from "../../../convex/model";

export { BackendError as HandoffServiceError };
type Handoff = Omit<Doc<"handoffs">, "_id" | "_creationTime">;
type Message = Omit<Doc<"messages">, "_id" | "_creationTime">;
function mapHandoff(h: Handoff): ReporterHandoff {
  return {
    id: h.id,
    status: h.status,
    requestedAt: new Date(h.requestedAt).toISOString(),
    claimedAt: h.claimedAt ? new Date(h.claimedAt).toISOString() : null,
    closedAt: h.closedAt ? new Date(h.closedAt).toISOString() : null,
    closeReason: h.closeReason ?? null,
  };
}
function mapStaff(
  h: Handoff,
  staff: StaffSession,
  name: string | null,
): StaffHandoff {
  return {
    ...mapHandoff(h),
    claimedByMe: h.claimedBy === staff.staffId,
    claimedByName: name,
  };
}
function mapMessage(m: Message): HandoffThreadMessage {
  return {
    id: m.id,
    sender: m.sender,
    source: m.source,
    body: maskSensitiveText(unseal(m.body, "chat_message")),
    createdAt: new Date(m.createdAt).toISOString(),
  };
}
function mapMessages(rows: Message[]) {
  return rows.flatMap((m) => {
    try {
      return [mapMessage(m)];
    } catch {
      return [];
    }
  });
}
function afterCursor(rows: Message[], after?: string | null) {
  const cursor = rows.find((m) => m.id === after);
  return cursor ? rows.filter((m) => m.seq > cursor.seq) : rows;
}
function serviceMessage(body: string) {
  return { id: randomUUID(), body: seal(body, "chat_message") };
}
function readAssistance(
  cache: Doc<"assistance"> | null,
): StaffAssistance | undefined {
  return cache
    ? (JSON.parse(unseal(cache.content, "staff_assistance")) as StaffAssistance)
    : undefined;
}
const joined =
  "Petugas sudah bergabung. Balasan otomatis AI dijeda. AI dapat membantu petugas meninjau keterangan Anda.";
export async function hasOpenHandoff(sessionId: string) {
  return query(api.chat.hasHandoff, { sessionId });
}
export async function createHandoff(
  session: ReporterSession,
  requestId?: string | null,
) {
  if (
    (await getServiceModeAt()) !== "operator" &&
    !(process.env.NODE_ENV === "development" && session.mode === "operator")
  )
    throw new BackendError(
      409,
      "outside_operator_hours",
      "Bantuan petugas hanya tersedia selama jam layanan. Anda tetap dapat melanjutkan dengan panduan.",
    );
  const r = await mutate(api.handoffs.request, {
    sessionId: session.id,
    id: randomUUID(),
    message: serviceMessage(
      "Permintaan bantuan petugas sudah dikirim. Anda tetap dapat menulis; pesan akan dibaca petugas saat bergabung.",
    ),
    requestId: requestId ?? undefined,
  });
  return {
    handoff: mapHandoff(r.handoff),
    message: r.message ? mapMessage(r.message) : null,
    latestMessageId: r.message?.id ?? null,
  };
}
export async function getReporterHandoff(
  sessionId: string,
  after?: string | null,
) {
  const s = await query(api.handoffs.reporterSnapshot, { sessionId });
  const h = s.handoff;
  if (!h)
    return {
      handoff: null,
      messages: [],
      latestMessageId: null,
      collectedFields: {},
    };
  const rows = afterCursor(
    s.messages.filter((m) => m.handoffId === h.id),
    after,
  );
  const assistance = readAssistance(s.assistance);
  return {
    handoff: mapHandoff(h),
    messages: mapMessages(rows),
    latestMessageId: rows.at(-1)?.id ?? after ?? null,
    collectedFields: assistance ? collectedChatFields(assistance) : {},
  };
}
export async function sendReporterHandoffMessage(
  session: ReporterSession,
  body: string,
) {
  const m = await mutate(api.handoffs.send, {
    sessionId: session.id,
    message: serviceMessage(body.trim()),
  });
  const s = await getReporterHandoff(session.id);
  return { handoff: s.handoff!, message: mapMessage(m), latestMessageId: m.id };
}
export async function getStaffChatQueue(
  staff: StaffSession,
): Promise<HandoffQueueItem[]> {
  return (
    await query(api.handoffs.queue, { staffSessionId: staff.sessionId })
  ).map((h) => ({
    id: h.id,
    status: h.status as "waiting" | "active",
    requestedAt: new Date(h.requestedAt).toISOString(),
    claimedAt: h.claimedAt ? new Date(h.claimedAt).toISOString() : null,
    claimedByMe: h.claimedBy === staff.staffId,
    claimedByName: h.claimedByName,
    messageCount: h.messageCount,
    lastMessageAt: h.lastMessageAt
      ? new Date(h.lastMessageAt).toISOString()
      : null,
  }));
}
export async function getActiveChatSessions(
  staff: StaffSession,
): Promise<ActiveConversation[]> {
  return (
    await query(api.handoffs.active, { staffSessionId: staff.sessionId })
  ).flatMap((r) => {
    try {
      const preview = maskSensitiveText(
        unseal(r.lastMessage.body, "chat_message"),
      )
        .replace(/\s+/g, " ")
        .trim();
      return [
        {
          sessionId: r.session.id,
          mode: r.session.mode,
          startedAt: new Date(r.session.createdAt).toISOString(),
          lastMessageAt: new Date(r.lastMessage.createdAt).toISOString(),
          messageCount: r.messageCount,
          preview:
            preview.length > 140 ? `${preview.slice(0, 137)}...` : preview,
        },
      ];
    } catch {
      return [];
    }
  });
}
async function claim(
  staff: StaffSession,
  target: { sessionId?: string; handoffId?: string },
  requestId?: string | null,
) {
  const r = await mutate(api.handoffs.claim, {
    staffSessionId: staff.sessionId,
    ...target,
    id: randomUUID(),
    message: serviceMessage(joined),
    requestId: requestId ?? undefined,
  });
  return {
    handoff: mapStaff(r.handoff, staff, r.claimedByName),
    message: r.message ? mapMessage(r.message) : null,
    latestMessageId: r.message?.id ?? null,
  };
}
export async function takeoverChatSession(
  staff: StaffSession,
  sessionId: string,
  requestId?: string | null,
) {
  return claim(staff, { sessionId }, requestId);
}
export async function claimStaffChat(
  staff: StaffSession,
  handoffId: string,
  requestId?: string | null,
) {
  return claim(staff, { handoffId }, requestId);
}
async function snapshot(staff: StaffSession, handoffId: string) {
  return query(api.handoffs.staffSnapshot, {
    staffSessionId: staff.sessionId,
    handoffId,
  });
}
export async function getStaffChatThread(
  staff: StaffSession,
  handoffId: string,
  requestId?: string | null,
) {
  const s = await snapshot(staff, handoffId);
  await recordAudit({
    actorType: "staff",
    actorId: staff.staffId,
    action: "staff.chat.viewed",
    objectType: "chat_handoff",
    objectId: handoffId,
    requestId,
    metadata: { messageCount: s.messages.length },
  });
  return {
    handoff: mapStaff(s.handoff, staff, s.claimedByName),
    messages: mapMessages(s.messages),
    latestMessageId: s.messages.at(-1)?.id ?? null,
  };
}
export async function getStaffChatMessages(
  staff: StaffSession,
  handoffId: string,
  after?: string | null,
) {
  const s = await snapshot(staff, handoffId);
  const rows = afterCursor(s.messages, after);
  return {
    handoff: mapStaff(s.handoff, staff, s.claimedByName),
    messages: mapMessages(rows),
    latestMessageId: rows.at(-1)?.id ?? after ?? null,
  };
}
export async function sendStaffChatMessage(
  staff: StaffSession,
  handoffId: string,
  body: string,
  requestId?: string | null,
) {
  return {
    message: mapMessage(
      await mutate(api.handoffs.send, {
        staffSessionId: staff.sessionId,
        handoffId,
        message: serviceMessage(body.trim()),
        requestId: requestId ?? undefined,
      }),
    ),
  };
}
export async function getStaffChatAssistance(
  staff: StaffSession,
  handoffId: string,
  requestId?: string | null,
  refresh = false,
) {
  const s = await snapshot(staff, handoffId);
  if (s.handoff.status !== "active")
    throw new BackendError(
      409,
      "handoff_not_active",
      "Percakapan ini tidak aktif.",
    );
  await recordAudit({
    actorType: "staff",
    actorId: staff.staffId,
    action: "staff.chat.assistance_viewed",
    objectType: "chat_handoff",
    objectId: handoffId,
    requestId,
  });
  const previous = readAssistance(s.assistance);
  if (!refresh && s.assistance?.revision === s.session.messageSeq && previous)
    return previous;
  const assistance = await makeStaffAssistance(
    mapMessages(s.messages),
    previous,
  );
  await mutate(api.handoffs.saveAssistance, {
    staffSessionId: staff.sessionId,
    handoffId,
    revision: s.session.messageSeq,
    content: seal(assistance, "staff_assistance"),
  });
  return assistance;
}
async function finish(
  target: { sessionId: string } | { staff: StaffSession; handoffId: string },
  requestId?: string | null,
) {
  const isStaff = "staff" in target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = isStaff
      ? await snapshot(target.staff, target.handoffId)
      : await query(api.handoffs.reporterSnapshot, {
          sessionId: target.sessionId,
        });
    if (!s.handoff)
      throw new BackendError(
        409,
        "handoff_not_open",
        "Tidak ada bantuan petugas yang aktif.",
      );
    const content = finalizeStaffAssistance(
      mapMessages(s.messages),
      readAssistance(s.assistance),
    );
    try {
      const r = await mutate(api.handoffs.finish, {
        staffSessionId: isStaff ? target.staff.sessionId : undefined,
        sessionId: isStaff ? undefined : target.sessionId,
        handoffId: s.handoff.id,
        revision: s.session.messageSeq,
        content: seal(content, "staff_assistance"),
        message: serviceMessage(
          isStaff
            ? "Percakapan dengan petugas sudah ditutup. Anda bisa melanjutkan draf atau meminta bantuan lagi."
            : "Bantuan petugas diakhiri oleh pelapor. Anda bisa melanjutkan dengan panduan atau meminta bantuan lagi.",
        ),
        requestId: requestId ?? undefined,
      });
      return {
        handoff: isStaff
          ? mapStaff(r.handoff, target.staff, target.staff.displayName)
          : mapHandoff(r.handoff),
        message: mapMessage(r.message),
        latestMessageId: r.message.id,
      };
    } catch (e) {
      if (
        !(e instanceof BackendError) ||
        e.code !== "assistance_stale" ||
        attempt === 2
      )
        throw e;
    }
  }
  throw new BackendError(
    409,
    "assistance_stale",
    "Ada pesan baru. Coba kembali.",
  );
}
export async function closeStaffChat(
  staff: StaffSession,
  handoffId: string,
  requestId?: string | null,
) {
  return finish({ staff, handoffId }, requestId);
}
export async function cancelReporterHandoff(
  session: ReporterSession,
  requestId?: string | null,
) {
  return finish({ sessionId: session.id }, requestId);
}
