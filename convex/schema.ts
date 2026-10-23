import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sealed = v.object({
  encrypted: v.string(),
  iv: v.string(),
  tag: v.string(),
});
export const mode = v.union(
  v.literal("ai"),
  v.literal("operator"),
  v.literal("unavailable"),
);
export const role = v.union(
  v.literal("petugas"),
  v.literal("bidan_pic"),
  v.literal("admin"),
  v.literal("auditor"),
);
export const source = v.union(
  v.literal("user"),
  v.literal("ai"),
  v.literal("fallback"),
  v.literal("staff"),
  v.literal("handoff"),
);
export const sender = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("service"),
  v.literal("staff"),
);
export const decision = v.union(
  v.literal("follow_up_required"),
  v.literal("follow_up_not_required"),
);
export const metadata = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
);

export default defineSchema({
  staff: defineTable({
    id: v.string(),
    username: v.string(),
    displayName: v.string(),
    passwordHash: v.string(),
    roles: v.array(role),
    active: v.boolean(),
    failedAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_username", ["username"]),
  staffSessions: defineTable({
    id: v.string(),
    staffId: v.string(),
    secretHash: v.string(),
    csrfToken: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_uuid", ["id"])
    .index("by_secret", ["secretHash"])
    .index("by_staff", ["staffId"]),
  sessions: defineTable({
    id: v.string(),
    secretHash: v.string(),
    csrfToken: v.string(),
    mode,
    status: v.union(v.literal("active"), v.literal("ended")),
    expiresAt: v.number(),
    createdAt: v.number(),
    messageSeq: v.number(),
    draftVersion: v.number(),
    openHandoffId: v.optional(v.string()),
    conversationEndedAt: v.optional(v.number()),
    reportId: v.optional(v.string()),
  })
    .index("by_uuid", ["id"])
    .index("by_secret", ["secretHash"])
    .index("by_status", ["status"]),
  messages: defineTable({
    id: v.string(),
    sessionId: v.string(),
    handoffId: v.optional(v.string()),
    staffId: v.optional(v.string()),
    sender,
    source,
    body: sealed,
    seq: v.number(),
    createdAt: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_session", ["sessionId", "seq"])
    .index("by_handoff", ["handoffId", "seq"]),
  handoffs: defineTable({
    id: v.string(),
    sessionId: v.string(),
    status: v.union(
      v.literal("waiting"),
      v.literal("active"),
      v.literal("closed"),
      v.literal("cancelled"),
    ),
    requestedAt: v.number(),
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    closeReason: v.optional(
      v.union(
        v.literal("staff_closed"),
        v.literal("reporter_cancelled"),
        v.literal("session_ended"),
      ),
    ),
  })
    .index("by_uuid", ["id"])
    .index("by_session", ["sessionId", "requestedAt"])
    .index("by_status", ["status"])
    .index("by_staff", ["claimedBy", "status"]),
  assistance: defineTable({
    sessionId: v.string(),
    revision: v.number(),
    content: sealed,
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),
  drafts: defineTable({
    id: v.string(),
    sessionId: v.string(),
    version: v.number(),
    body: sealed,
    status: v.union(
      v.literal("ready_for_confirmation"),
      v.literal("confirmed"),
    ),
    expiresAt: v.number(),
  })
    .index("by_uuid", ["id"])
    .index("by_session", ["sessionId", "version"]),
  reports: defineTable({
    id: v.string(),
    referenceCode: v.string(),
    sessionId: v.string(),
    draftId: v.string(),
    version: v.number(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("decision_recorded"),
    ),
    submittedAt: v.number(),
    mode,
    name: sealed,
    nik: v.optional(sealed),
    nikLast4: v.optional(v.string()),
    relation: sealed,
    content: sealed,
    safeContact: v.boolean(),
    contact: v.optional(sealed),
    assignedTo: v.optional(v.string()),
    decision: v.optional(decision),
    reason: v.optional(sealed),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
    privacyNoticeVersion: v.string(),
    privacyPurpose: v.string(),
  })
    .index("by_uuid", ["id"])
    .index("by_reference", ["referenceCode"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_draft", ["draftId"])
    .index("by_session", ["sessionId"])
    .index("by_submitted", ["submittedAt"]),
  reviews: defineTable({
    reportId: v.string(),
    staffId: v.string(),
    body: sealed,
    createdAt: v.number(),
  }).index("by_report", ["reportId"]),
  audit: defineTable({
    actorType: v.union(
      v.literal("anonymous"),
      v.literal("staff"),
      v.literal("system"),
    ),
    actorId: v.optional(v.string()),
    action: v.string(),
    objectType: v.string(),
    objectId: v.optional(v.string()),
    requestId: v.optional(v.string()),
    metadata,
    occurredAt: v.number(),
  }).index("by_time", ["occurredAt"]),
  outbox: defineTable({
    reportId: v.string(),
    eventType: v.string(),
    status: v.literal("pending"),
    createdAt: v.number(),
  }),
  schedules: defineTable({
    weekday: v.number(),
    opensAt: v.string(),
    closesAt: v.string(),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
  }).index("by_weekday", ["weekday", "effectiveFrom"]),
  exceptions: defineTable({
    date: v.string(),
    isClosed: v.boolean(),
    opensAt: v.optional(v.string()),
    closesAt: v.optional(v.string()),
  }).index("by_date", ["date"]),
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiry", ["resetAt"]),
});
