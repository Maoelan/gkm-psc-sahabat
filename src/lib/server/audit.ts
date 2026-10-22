import { api, mutate } from "./convex";
export type AuditInput = {
  actorType: "anonymous" | "staff" | "system";
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};
export async function recordAudit(input: AuditInput) {
  await mutate(api.security.recordAudit, {
    ...input,
    actorId: input.actorId ?? undefined,
    objectId: input.objectId ?? undefined,
    requestId: input.requestId ?? undefined,
  });
}
