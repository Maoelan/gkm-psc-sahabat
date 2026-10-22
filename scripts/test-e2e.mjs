import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { cp, mkdtemp, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const root = process.cwd();
const workspace = await mkdtemp(path.join(tmpdir(), "lapor-convex-e2e-"));
let server, backend;
async function command(args, options = {}) {
  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...options,
  });
  let error = "";
  child.stderr.on("data", (b) => {
    error += b;
  });
  const [code] = await once(child, "exit");
  if (code !== 0)
    throw new Error(
      `Test command failed (${path.basename(args[0])}). ${options.sensitive ? "Private output withheld." : error.slice(-3000)}`,
    );
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "exit");
  } else {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
try {
  await cp(path.join(root, "convex"), path.join(workspace, "convex"), {
    recursive: true,
  });
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({
      name: "lapor-convex-e2e",
      type: "module",
      dependencies: { convex: "*" },
    }),
  );
  await symlink(
    path.join(root, "node_modules"),
    path.join(workspace, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const cli = path.join(root, "node_modules/convex/bin/main.js");
  const backendPort = process.env.E2E_CONVEX_PORT || "3212";
  const convexUrl = `http://127.0.0.1:${backendPort}`;
  const isolatedEnv = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
  delete isolatedEnv.CONVEX_DEPLOYMENT;
  delete isolatedEnv.CONVEX_DEPLOY_KEY;
  delete isolatedEnv.CONVEX_URL;
  const backendVersion =
    process.env.E2E_CONVEX_BACKEND_VERSION || "precompiled-2026-10-10-72ce13c";
  backend = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local-cloud-port",
      backendPort,
      "--local-site-port",
      String(Number(backendPort) + 1),
      "--local-backend-version",
      backendVersion,
      "--typecheck",
      "disable",
      "--tail-logs",
      "disable",
    ],
    {
      cwd: workspace,
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let backendLog = "";
  const collect = (b) => {
    backendLog += b.toString();
  };
  backend.stdout.on("data", collect);
  backend.stderr.on("data", collect);
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (backend.exitCode !== null)
      throw new Error(
        `Isolated Convex backend stopped before initialization: ${backendLog.replace(/[A-Za-z0-9_|.-]{40,}/g, "[redacted]").slice(-2000)}`,
      );
    if (/Convex functions ready/.test(backendLog)) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error(
      `Isolated Convex backend did not become ready: ${backendLog.replace(/[A-Za-z0-9_|.-]{40,}/g, "[redacted]").slice(-2000)}`,
    );
  const key = randomBytes(32).toString("base64url");
  await command([cli, "env", "set", "APPLICATION_SERVER_KEY", key], {
    cwd: workspace,
    env: isolatedEnv,
    sensitive: true,
  });
  const password = randomBytes(24).toString("base64url");
  const salt = randomBytes(16);
  const passwordHash = `scrypt$16384$8$1$${salt.toString("base64")}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")}`;
  await new ConvexHttpClient(convexUrl, { logger: false }).mutation(
    api.seed.demo,
    {
      key,
      accounts: [
        {
          id: randomUUID(),
          username: "e2e",
          displayName: "Petugas Uji",
          passwordHash,
          roles: ["admin", "petugas"],
        },
      ],
      allDay: true,
    },
  );
  const production = process.env.E2E_PRODUCTION === "true";
  const port = process.env.E2E_PORT || (production ? "5176" : "5175");
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    CONVEX_URL: convexUrl,
    APPLICATION_SERVER_KEY: key,
    PUBLIC_BASE_URL: base,
    DEPLOY_TARGET: "node",
    REPORT_DATA_KEY: randomBytes(32).toString("base64"),
    NIK_DATA_KEY: randomBytes(32).toString("base64"),
    AI_ENABLED: "false",
    WHATSAPP_PROVIDER: "outbox",
    E2E_BASE_URL: base,
    E2E_USERNAME: "e2e",
    E2E_PASSWORD: password,
    ...(production
      ? { NODE_ENV: "production", HOST: "127.0.0.1", PORT: port }
      : {}),
  };
  delete env.VERCEL;
  if (production)
    await command(["node_modules/vite/bin/vite.js", "build"], { env });
  server = spawn(
    process.execPath,
    production
      ? ["build/index.js"]
      : [
          "node_modules/vite/bin/vite.js",
          "dev",
          "--host",
          "127.0.0.1",
          "--port",
          port,
          "--strictPort",
        ],
    { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  let serverError = "";
  server.stderr.on("data", (b) => {
    serverError += b;
  });
  ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null)
      throw new Error(`Test server stopped: ${serverError.slice(-1500)}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Test server did not become ready.");
  const browser = spawn("python", ["tests/e2e/chat_flow.py"], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const [code] = await once(browser, "exit");
  if (code !== 0) throw new Error("Browser verification failed.");
} finally {
  await stop(server);
  await stop(backend);
}
