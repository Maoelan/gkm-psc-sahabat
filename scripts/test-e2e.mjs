import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

const schema = `lapor_e2e_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL diperlukan.');
const client = new pg.Client({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false });
let server;
try {
	await client.connect();
	await client.query(`CREATE SCHEMA ${schema}`);
	await client.query(`SET search_path TO ${schema}`);
	for (const migration of ['001_initial.sql', '002_chat_transcript.sql', '003_staff_handoff.sql']) await client.query(await readFile(new URL(`../db/${migration}`, import.meta.url), 'utf8'));
	const password = randomBytes(24).toString('base64url');
	const salt = randomBytes(16);
	const hash = `scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
	const staffId = randomUUID();
	await client.query("INSERT INTO staff_users (id,username,display_name,password_hash) VALUES ($1,'e2e','Petugas Uji',$2)", [staffId, hash]);
	await client.query("INSERT INTO staff_roles (staff_id,role,scope) VALUES ($1,'admin','all'),($1,'petugas','all')", [staffId]);
	const url = new URL(databaseUrl); url.searchParams.set('options', `-c search_path=${schema}`);
	const production = process.env.E2E_PRODUCTION === 'true';
	const port = process.env.E2E_PORT || (production ? '5176' : '5175');
	for (let weekday = 1; weekday <= 7; weekday++) await client.query("INSERT INTO service_schedules (id,weekday,opens_at,closes_at,effective_from) VALUES ($1,$2,'00:00','23:59','2000-01-01')", [randomUUID(), weekday]);
	const base = `http://127.0.0.1:${port}`;
	const env = { ...process.env, DATABASE_URL: url.toString(), PUBLIC_BASE_URL: base, REPORT_DATA_KEY: randomBytes(32).toString('base64'), NIK_DATA_KEY: randomBytes(32).toString('base64'), AI_ENABLED: 'false', WHATSAPP_PROVIDER: 'outbox', E2E_BASE_URL: base, E2E_USERNAME: 'e2e', E2E_PASSWORD: password, ...(production ? { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: port } : {}) };
	if (production) {
		const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
		let buildError = '';
		build.stderr.on('data', (chunk) => { buildError += chunk.toString(); });
		const [buildCode] = await once(build, 'exit');
		if (buildCode !== 0) throw new Error(`Build uji gagal: ${buildError}`);
	}
	server = spawn(process.execPath, production ? ['build/index.js'] : ['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', port, '--strictPort'], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
	let serverError = '';
	server.stderr.on('data', (chunk) => { serverError += chunk.toString(); });
	let ready = false;
	for (let attempt = 0; attempt < 60; attempt++) {
		if (server.exitCode !== null) throw new Error(`Server uji berhenti: ${serverError}`);
		try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	if (!ready) throw new Error('Server uji belum siap.');
	const browserTest = spawn('python', ['tests/e2e/chat_flow.py'], { env, stdio: 'inherit', windowsHide: true });
	const [code] = await once(browserTest, 'exit');
	if (code !== 0) throw new Error('Uji browser gagal.');
} finally {
	if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
	await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
	await client.end();
}
