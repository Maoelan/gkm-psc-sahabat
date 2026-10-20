#!/usr/bin/env node
/**
 * Pemindai rahasia lokal. Tidak pernah mencetak nilai rahasia.
 *
 * Jalankan sebelum commit/push:
 *   npm run security:scan
 *
 * Skrip ini memeriksa nilai .env yang bocor ke file lain, pola kredensial umum,
 * file sensitif yang tidak sengaja dilacak Git, serta data identitas contoh yang
 * tidak diizinkan. Ini bukan pengganti secret scanning GitHub atau gitleaks.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const skipDirNames = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  'build',
  '.vercel',
  '.netlify',
  '.wrangler',
  'coverage',
  'playwright-report',
  'test-results',
  '.agents',
  '.impeccable',
  '.taste-skill',
  'taste-chat-output',
  '.tmp',
  '.cache',
  '.turbo'
]);
const textExtensions = new Set([
  '.cjs', '.css', '.example', '.html', '.js', '.json', '.jsx', '.map', '.mjs', '.md',
  '.npmrc', '.svelte', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
]);
const secretEnvKeys = new Set([
  'DATABASE_URL',
  'DATABASE_ADMIN_URL',
  'REPORT_DATA_KEY',
  'NIK_DATA_KEY',
  'NVIDIA_API_KEY',
  'DEMO_STAFF_PETUGAS_PASSWORD',
  'DEMO_STAFF_BIDAN_PASSWORD',
  'META_WHATSAPP_TOKEN',
  'META_PHONE_NUMBER_ID',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'WHATSAPP_TOKEN',
  'WHATSAPP_SENDER',
  'WHATSAPP_RECIPIENT_NUMBER',
  'PIC_WHATSAPP_NUMBER'
]);
const allowedSamples = new Set([
  '0000000000000001',
  '0000000000000002',
  '0812-3456-7890',
  '+62 812-3456-7890',
  'ayu@example.test'
]);
const placeholderPattern = /(?:CHANGE_ME|GENERATE_|SET_YOUR|YOUR_|EXAMPLE|PLACEHOLDER|ganti-dengan)/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirNames.has(entry.name) && !entry.name.startsWith('tmp-')) walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (textExtensions.has(ext) || ['.gitignore', '.npmrc', '.env.example'].includes(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function redact(value, type) {
  if (type === 'phone') return `${value.slice(0, 4)}…${value.slice(-2)}`;
  if (type === '16_digit_number') return `***${value.slice(-4)}`;
  if (type === 'db_url') return 'postgresql://***';
  if (value.length <= 10) return '***';
  return `${value.slice(0, 4)}…${value.slice(-2)} (len ${value.length})`;
}

function parseEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return new Map();
  const values = new Map();
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !secretEnvKeys.has(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) values.set(match[1], value);
  }
  return values;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function gitSucceeds(args) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const findings = [];
const add = (finding) => findings.push(finding);

const files = walk(root);
const env = parseEnv();
const envValues = [];
for (const [key, value] of env) {
  if (value.length < 6 || placeholderPattern.test(value)) continue;
  envValues.push({ key, value });
  if (key === 'DATABASE_URL' || key === 'DATABASE_ADMIN_URL') {
    try {
      const url = new URL(value);
      if (url.password && !placeholderPattern.test(url.password)) {
        envValues.push({ key: `${key} (password)`, value: decodeURIComponent(url.password) });
      }
    } catch {
      // Abaikan URL yang tidak bisa diparse; pola DB URL tetap diperiksa.
    }
  }
}

for (const file of files) {
  const name = relative(file);
  if (name === '.env' || name === '.env.example') continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const { key, value } of envValues) {
    if (content.includes(value)) add({ type: 'env_value', key, file: name });
  }
}

const patterns = [
  ['nvidia_key', /nvapi-[A-Za-z0-9_-]{20,}/g],
  ['provider_key', /\bsk-[A-Za-z0-9_-]{20,}/g],
  ['github_token', /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['twilio_sid', /\bAC[0-9a-fA-F]{32}\b/g],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['absolute_user_path', /[A-Za-z]:\\Users\\[^\s'"<>]+/g]
];

for (const file of files) {
  const name = relative(file);
  if (name === '.env' || name === '.env.example') continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [type, pattern] of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (!match) continue;
      add({ type, file: name, line: index + 1, preview: redact(match[0], type) });
    }

    for (const match of line.matchAll(/\b\d{16}\b/g)) {
      if (allowedSamples.has(match[0])) continue;
      add({ type: '16_digit_number', file: name, line: index + 1, preview: redact(match[0], '16_digit_number') });
    }

    for (const match of line.matchAll(/(?:\+62|62|0)8[1-9][0-9 -]{7,13}/g)) {
      const value = match[0].trim();
      if (allowedSamples.has(value)) continue;
      add({ type: 'phone', file: name, line: index + 1, preview: redact(value, 'phone') });
    }

    for (const match of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (allowedSamples.has(match[0])) continue;
      add({ type: 'email', file: name, line: index + 1, preview: redact(match[0], 'email') });
    }

    for (const match of line.matchAll(/postgres(?:ql)?:\/\/[^\s:'"<>]+:[^\s@'"<>]+@[^\s'"<>]+/gi)) {
      if (placeholderPattern.test(match[0])) continue;
      add({ type: 'db_url', file: name, line: index + 1, preview: redact(match[0], 'db_url') });
    }
  }
}

const tracked = git(['ls-files']);
if (tracked) {
  const sensitiveTracked = tracked.split(/\r?\n/).filter((name) =>
    /(^|\/)\.env($|\.)/.test(name) && !name.endsWith('.env.example') ||
    /\.(pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|dump|backup)$/i.test(name) ||
    /(^|\/)(node_modules|build|\.svelte-kit|\.agents|\.impeccable|\.taste-skill|taste-chat-output)\//.test(name)
  );
  for (const file of sensitiveTracked) add({ type: 'sensitive_tracked_file', file });
}

const envPath = path.join(root, '.env');
const isGitRepo = git(['rev-parse', '--is-inside-work-tree']) === 'true';
if (isGitRepo && fs.existsSync(envPath)) {
  const isTracked = gitSucceeds(['ls-files', '--error-unmatch', '.env']);
  if (isTracked) add({ type: 'tracked_env_file', file: '.env' });
  else if (!gitSucceeds(['check-ignore', '-q', '.env'])) add({ type: 'env_not_ignored', file: '.env' });
}

const unique = new Map(findings.map((finding) => [JSON.stringify(finding), finding]));
if (unique.size === 0) {
  console.log(`SECRET_SCAN_OK: ${files.length} file diperiksa; tidak ada indikasi rahasia.`);
} else {
  for (const finding of unique.values()) console.error(JSON.stringify(finding));
  console.error(`SECRET_SCAN_FAILED: ${unique.size} temuan. Hapus nilai rahasia dan rotasi kredensial bila sudah terlanjur tersebar.`);
  process.exitCode = 1;
}
