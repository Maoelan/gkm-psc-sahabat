import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
try {
  if (!process.env.CONVEX_URL || !process.env.APPLICATION_SERVER_KEY)
    throw new Error("Missing configuration");
  await new ConvexHttpClient(process.env.CONVEX_URL, { logger: false }).query(
    api.sessions.health,
    { key: process.env.APPLICATION_SERVER_KEY },
  );
  for (const name of ["REPORT_DATA_KEY", "NIK_DATA_KEY"])
    if (Buffer.from(process.env[name] ?? "", "base64").length !== 32)
      throw new Error("Invalid encryption configuration");
  if (
    process.env.WHATSAPP_PROVIDER &&
    process.env.WHATSAPP_PROVIDER !== "outbox"
  )
    throw new Error("Evaluation requires outbox mode");
  console.log(
    "CONVEX_CHECK_OK: backend reachable; server key accepted; encryption keys valid; external notifications disabled.",
  );
} catch {
  console.error(
    "CONVEX_CHECK_FAILED: verify deployment, server key, encryption keys and outbox configuration. No secrets printed.",
  );
  process.exitCode = 1;
}
