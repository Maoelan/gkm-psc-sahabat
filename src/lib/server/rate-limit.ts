import { api, mutate } from "./convex";
import { hashSecret } from "./crypto";

export async function allowAttempt(
  key: string,
  limit: number,
  windowMs: number,
) {
  return mutate(api.security.attempt, {
    bucket: hashSecret(key),
    limit,
    windowMs,
  });
}
export async function resetAttempts(key: string) {
  await mutate(api.security.attempt, {
    bucket: hashSecret(key),
    limit: 1,
    windowMs: 1,
    reset: true,
  });
}
