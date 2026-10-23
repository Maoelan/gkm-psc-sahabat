import { json } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import {
  directAnswerFields,
  fallbackChatTurn,
  makeChatTurn,
  remainingChatFields,
  type ChatFields,
} from "../../../../lib/server/ai";
import { recentChatHistory } from "../../../../lib/server/chat-history";
import { api, mutate, seal, BackendError } from "../../../../lib/server/convex";
import { hasOpenHandoff } from "../../../../lib/server/handoffs";
import { allowAttempt } from "../../../../lib/server/rate-limit";
import {
  hasValidCsrf,
  requestOriginAllowed,
  requireSession,
} from "../../../../lib/server/session";
import {
  chatTurnSchema,
  validationMessage,
} from "../../../../lib/server/validation";

export async function POST({ cookies, request, locals }) {
  if (!requestOriginAllowed(request))
    return json({ error: "Permintaan lintas situs ditolak." }, { status: 403 });
  const session = await requireSession(cookies);
  if (!session)
    return json(
      { error: "Sesi tidak tersedia atau sudah berakhir." },
      { status: 401 },
    );
  if (!hasValidCsrf(request, session))
    return json({ error: "Token keamanan sesi tidak cocok." }, { status: 403 });
  if (session.conversationEndedAt) return json({ error: "Percakapan telah dihentikan admin. Periksa draf untuk melanjutkan laporan.", code: "conversation_ended" }, { status: 409 });
  if (!(await allowAttempt(`chat-turn:${session.id}`, 30, 10 * 60_000)))
    return json(
      { error: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." },
      { status: 429 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Payload tidak valid." }, { status: 400 });
  }
  const parsed = chatTurnSchema.safeParse(body);
  if (!parsed.success)
    return json({ error: validationMessage(parsed.error) }, { status: 422 });
  const userMessage = parsed.data.userMessage?.trim() || "";
  const fields: ChatFields = {
    incidentTime: parsed.data.incidentTime,
    incidentLocation: parsed.data.incidentLocation,
    need: parsed.data.need,
  };
  const handoffAlreadyOpen = await hasOpenHandoff(session.id);
  const automaticChat = session.mode !== "unavailable" && !handoffAlreadyOpen;
  const history = automaticChat ? await recentChatHistory(session.id) : [];
  const result =
    automaticChat
      ? await makeChatTurn({
          fields,
          story: parsed.data.story,
          lastAnswer: userMessage,
          history,
          answerField: parsed.data.answerField,
        })
      : (() => {
          const answered = directAnswerFields(
            fields,
            userMessage,
            parsed.data.answerField,
          );
          return {
            ...fallbackChatTurn(remainingChatFields(answered)),
            fields: answered,
          };
        })();
  const userMessageId = randomUUID();
  try {
    // The mutation rechecks the session and handoff after provider work finishes.
    const saved = await mutate(api.chat.saveTurn, {
      sessionId: session.id,
      user: userMessage
        ? { id: userMessageId, body: seal(userMessage, "chat_message") }
        : undefined,
      assistant: {
        id: randomUUID(),
        body: seal(result.message, "chat_message"),
        sender: result.source === "nvidia" ? "assistant" : "service",
        source: result.source === "nvidia" ? "ai" : "fallback",
      },
      requestId: locals.requestId,
    });
    if ("submitted" in saved)
      return json({ error: "Laporan sudah dikirim." }, { status: 409 });
    if (saved.blocked)
      return json(
        {
          error:
            "Bantuan petugas baru saja aktif. AI dijeda; pesan Anda diteruskan ke petugas.",
          code: "handoff_open",
          accepted: Boolean(userMessage),
          userMessageId,
        },
        { status: 409 },
      );
  } catch (e) {
    if (e instanceof BackendError)
      return json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
  return json({
    userMessageId,
    flowComplete: result.flowComplete,
    message: result.message,
    question: result.question,
    source: result.source,
    missingField: result.missingField,
    fields: result.fields ?? fields,
  });
}
