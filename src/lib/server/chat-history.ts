import { api, query, unseal } from "./convex";
import type { ChatHistoryMessage } from "./ai";

export async function recentChatHistory(
  sessionId: string,
  limit = 8,
): Promise<ChatHistoryMessage[]> {
  const rows = await query(api.chat.history, {
    sessionId,
    limit: Math.min(Math.max(Math.trunc(limit), 1), 12),
  });
  const messages: ChatHistoryMessage[] = [];
  for (const row of rows) {
    try {
      const body = unseal(row.body, "chat_message").trim();
      if (body)
        messages.push({
          role: row.sender === "user" ? "user" : "assistant",
          body,
        });
    } catch {
      /* A damaged encrypted message is excluded from provider context. */
    }
  }
  return messages;
}
