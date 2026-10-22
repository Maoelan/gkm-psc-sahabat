import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { requiredEnv } from "./env";
import { encrypt, decrypt, type EncryptionPurpose } from "./crypto";
export { api } from "../../../convex/_generated/api";

export type Sealed = { encrypted: string; iv: string; tag: string };
export function seal(value: unknown, purpose: EncryptionPurpose): Sealed {
  const encrypted = encrypt(value, purpose);
  return {
    encrypted: encrypted.encrypted.toString("base64"),
    iv: encrypted.iv.toString("base64"),
    tag: encrypted.tag.toString("base64"),
  };
}
export function unseal(value: Sealed, purpose: EncryptionPurpose) {
  return decrypt(
    Buffer.from(value.encrypted, "base64"),
    Buffer.from(value.iv, "base64"),
    Buffer.from(value.tag, "base64"),
    purpose,
  );
}
export class BackendError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function client() {
  const url = requiredEnv("CONVEX_URL");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(parsed.hostname)
  )
    throw new Error("CONVEX_URL wajib HTTPS.");
  return new ConvexHttpClient(url, { logger: false });
}
function key() {
  const value = requiredEnv("APPLICATION_SERVER_KEY");
  if (value.length < 43)
    throw new Error("APPLICATION_SERVER_KEY minimal 32 byte acak.");
  return value;
}
function translate(error: unknown): never {
  if (
    error instanceof ConvexError &&
    error.data &&
    typeof error.data === "object" &&
    "status" in error.data
  ) {
    const data = error.data as {
      status: number;
      code: string;
      message: string;
    };
    throw new BackendError(data.status, data.code, data.message);
  }
  throw new BackendError(
    503,
    "backend_unavailable",
    "Penyimpanan sedang tidak tersedia. Coba lagi nanti.",
  );
}
export async function query<F extends FunctionReference<"query">>(
  ref: F,
  args: Omit<FunctionArgs<F>, "key">,
): Promise<FunctionReturnType<F>> {
  try {
    return await client().query(ref, {
      ...args,
      key: key(),
    } as FunctionArgs<F>);
  } catch (e) {
    return translate(e);
  }
}
export async function mutate<F extends FunctionReference<"mutation">>(
  ref: F,
  args: Omit<FunctionArgs<F>, "key">,
): Promise<FunctionReturnType<F>> {
  try {
    return await client().mutation(ref, {
      ...args,
      key: key(),
    } as FunctionArgs<F>);
  } catch (e) {
    return translate(e);
  }
}
