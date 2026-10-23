import {
  mutationGeneric,
  queryGeneric,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
  type TableNamesInDataModel,
} from "convex/server";
import { ConvexError } from "convex/values";
import schema from "./schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type Table = TableNamesInDataModel<DataModel>;
export type Doc<T extends Table> = DocumentByName<DataModel, T>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export const query = queryGeneric as QueryBuilder<DataModel, "public">;
export const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
export function fail(status: number, code: string, message: string): never {
  throw new ConvexError({ status, code, message });
}

export function serverOnly(key: string) {
  const expected = process.env.APPLICATION_SERVER_KEY;
  if (!expected || expected.length < 43 || key.length !== expected.length)
    fail(403, "backend_forbidden", "Akses backend ditolak.");
  let difference = 0;
  for (let i = 0; i < key.length; i++)
    difference |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference) fail(403, "backend_forbidden", "Akses backend ditolak.");
}
export async function reporter(ctx: QueryCtx, sessionId: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_uuid", (q) => q.eq("id", sessionId))
    .unique();
  if (
    !session ||
    session.status !== "active" ||
    session.expiresAt <= Date.now()
  )
    fail(401, "session_expired", "Sesi sudah berakhir. Muat ulang halaman.");
  return session;
}
export async function staffMember(
  ctx: QueryCtx,
  staffId: string,
  roles = ["petugas", "admin"],
) {
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_uuid", (q) => q.eq("id", staffId))
    .unique();
  if (!staff?.active || !staff.roles.some((r) => roles.includes(r)))
    fail(403, "staff_forbidden", "Peran akun tidak memiliki akses.");
  return staff;
}
export async function staffSession(
  ctx: QueryCtx,
  sessionId: string,
  roles = ["petugas", "admin"],
) {
  const session = await ctx.db
    .query("staffSessions")
    .withIndex("by_uuid", (q) => q.eq("id", sessionId))
    .unique();
  if (!session || session.revokedAt || session.expiresAt <= Date.now())
    fail(401, "staff_unauthorized", "Sesi petugas sudah berakhir.");
  return staffMember(ctx, session.staffId, roles);
}
export async function audit(
  ctx: MutationCtx,
  input: Omit<
    Doc<"audit">,
    "_id" | "_creationTime" | "occurredAt" | "metadata"
  > & { metadata?: Doc<"audit">["metadata"] },
) {
  await ctx.db.insert("audit", {
    ...input,
    metadata: input.metadata ?? {},
    occurredAt: Date.now(),
  });
}
export async function messages(ctx: QueryCtx, sessionId: string) {
  return ctx.db
    .query("messages")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}
export async function appendMessage(
  ctx: MutationCtx,
  sessionId: string,
  input: Omit<
    Doc<"messages">,
    "_id" | "_creationTime" | "sessionId" | "seq" | "createdAt"
  >,
) {
  const session = await reporter(ctx, sessionId);
  const createdAt = Date.now();
  const row = { ...input, sessionId, seq: session.messageSeq + 1, createdAt };
  await ctx.db.insert("messages", row);
  await ctx.db.patch(session._id, { messageSeq: row.seq });
  return row;
}
export async function openHandoff(ctx: QueryCtx, session: Doc<"sessions">) {
  if (!session.openHandoffId) return null;
  return ctx.db
    .query("handoffs")
    .withIndex("by_uuid", (q) => q.eq("id", session.openHandoffId!))
    .unique();
}

export function requireOpenConversation(session: Doc<"sessions">) {
  if (session.conversationEndedAt) fail(409, "conversation_ended", "Percakapan telah dihentikan admin. Anda tetap dapat memeriksa dan mengirim draf laporan.");
}
