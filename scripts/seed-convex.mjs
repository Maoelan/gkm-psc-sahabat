import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = process.env.CONVEX_URL;
const key = process.env.APPLICATION_SERVER_KEY;
if (!url || !key || key.length < 43)
  throw new Error("Configure CONVEX_URL and APPLICATION_SERVER_KEY first.");
if (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== "outbox")
  throw new Error("Evaluation seeding requires WHATSAPP_PROVIDER=outbox.");
const accounts = ["petugas", "bidan", "admin"].map((username) => {
  const password = process.env[`DEMO_STAFF_${username.toUpperCase()}_PASSWORD`];
  if (!password || password.length < 14 || /CHANGE_ME|SET_YOUR/.test(password))
    throw new Error(
      `Set a unique password of at least 14 characters for ${username}.`,
    );
  const salt = randomBytes(16);
  const passwordHash = `scrypt$16384$8$1$${salt.toString("base64")}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")}`;
  return {
    id: randomUUID(),
    username,
    displayName:
      username === "bidan"
        ? "Bidan/PIC"
        : username === "petugas"
          ? "Petugas"
          : "Admin",
    passwordHash,
    roles:
      username === "bidan"
        ? ["bidan_pic", "admin"]
        : username === "petugas"
          ? ["petugas", "admin"]
          : ["admin"],
  };
});
try {
  const result = await new ConvexHttpClient(url, { logger: false }).mutation(
    api.seed.demo,
    { key, accounts },
  );
  console.log(
    `CONVEX_SEED_OK: ${result.accounts} demo accounts and service schedules prepared. Existing reports preserved.`,
  );
} catch {
  console.error(
    "Convex seeding failed. Verify the target and server key; no credentials were printed.",
  );
  process.exitCode = 1;
}
