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
  '.npmrc', '.py', '.svelte', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
]);
const secretEnvKeys = new Set([
  'DATABASE_URL',
  'DATABASE_ADMIN_URL',
  'REPORT_DATA_KEY',
  'NIK_DATA_KEY',
  'NVIDIA_API_KEY',
  'DEMO_STAFF_PETUGAS_PASSWORD',
  'DEMO_STAFF_BIDAN_PASSWORD',
  'DEMO_STAFF_ADMIN_PASSWORD',
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
  if (name === '.env') continue;
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
  if (name === '.env') continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [type, pattern] of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (!match) continue;
      add({ type, file: name, line: index + 1 });
    }

    for (const match of line.matchAll(/\b\d{16}\b/g)) {
      if (allowedSamples.has(match[0])) continue;
      add({ type: '16_digit_number', file: name, line: index + 1 });
    }

    for (const match of line.matchAll(/(?:\+62|62|0)8[1-9][0-9 -]{7,13}/g)) {
      const value = match[0].trim();
      if (allowedSamples.has(value)) continue;
      add({ type: 'phone', file: name, line: index + 1 });
    }

    for (const match of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (allowedSamples.has(match[0])) continue;
      add({ type: 'email', file: name, line: index + 1 });
    }

    for (const match of line.matchAll(/postgres(?:ql)?:\/\/[^\s:'"<>]+:[^\s@'"<>]+@[^\s'"<>]+/gi)) {
      if (placeholderPattern.test(match[0])) continue;
      add({ type: 'db_url', file: name, line: index + 1 });
    }
  }
}

// Inspect the index/history blobs themselves, so a clean working copy cannot hide an older leak.
const requestedScopes = new Set(process.argv.slice(2));
if ((requestedScopes.has('--history') || requestedScopes.has('--staged')) && git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
  add({ type: 'git_scan_unavailable', file: '.git' });
}
let scannedClientFiles = 0;
if (requestedScopes.has('--client')) {
  const clientRoot = path.join(root, '.svelte-kit', 'output', 'client');
  if (!fs.existsSync(clientRoot)) add({ type: 'client_build_missing', file: '.svelte-kit/output/client' });
  for (const file of walk(clientRoot)) {
    const name = relative(file);
    const content = fs.readFileSync(file, 'utf8');
    scannedClientFiles++;
    for (const { key, value } of envValues) if (content.includes(value)) add({ type: 'client_env_value', key, file: name });
    for (const [type, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) add({ type, file: name, scope: 'client' });
    }
  }
}

const blobs = new Map();
if (requestedScopes.has('--staged')) {
  for (const line of git(['ls-files', '--stage']).split(/\r?\n/)) {
    const match = line.match(/^\d+ ([a-f0-9]{40}) \d\t(.+)$/);
    if (match) blobs.set(match[1], { file: match[2], scope: 'index' });
  }
}
if (requestedScopes.has('--history')) {
  for (const line of git(['rev-list', '--objects', '--all']).split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{40}) (.+)$/);
    if (match && !blobs.has(match[1])) blobs.set(match[1], { file: match[2], scope: 'history' });
  }
}
let scannedBlobs = 0;
for (const [sha, { file, scope }] of blobs) {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example')) add({ type: 'sensitive_git_file', file, scope });
  if (!textExtensions.has(path.extname(file).toLowerCase()) && !['.gitignore', '.npmrc'].includes(path.basename(file))) continue;
  let content;
  try { content = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { add({ type: 'unreadable_git_blob', file, scope }); continue; }
  scannedBlobs++;
  for (const { key, value } of envValues) if (content.includes(value)) add({ type: 'env_value', key, file, scope });
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    for (const [type, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[index])) add({ type, file, line: index + 1, scope });
    }
    for (const match of lines[index].matchAll(/postgres(?:ql)?:\/\/[^\s:'"<>]+:[^\s@'"<>]+@[^\s'"<>]+/gi)) {
      if (!placeholderPattern.test(match[0])) add({ type: 'db_url', file, line: index + 1, scope });
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
  console.log(`SECRET_SCAN_OK: ${files.length} file dan ${scannedBlobs} blob Git, dan ${scannedClientFiles} file klien diperiksa; tidak ada indikasi rahasia.`);
} else {
  for (const finding of unique.values()) console.error(JSON.stringify(finding));
  console.error(`SECRET_SCAN_FAILED: ${unique.size} temuan. Hapus nilai rahasia dan rotasi kredensial bila sudah terlanjur tersebar.`);
  process.exitCode = 1;
}
