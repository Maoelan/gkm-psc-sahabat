import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Cookies } from '@sveltejs/kit';

// Each run uses a separate PostgreSQL schema; existing reports/accounts are never reset.
const schema = `lapor_test_${randomUUID().replaceAll('-', '')}`;
const originalUrl = process.env.DATABASE_URL;
const admin = new pg.Client({ connectionString: originalUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false });
let reports: typeof import('../../src/lib/server/reports');
let sessions: typeof import('../../src/lib/server/session');
let handoffs: typeof import('../../src/lib/server/handoffs');
let crypto: typeof import('../../src/lib/server/crypto');
let db: pg.Pool;
let turn: typeof import('../../src/routes/api/chat/turn/+server');
const staffId = randomUUID();
const staff = { staffId, sessionId: randomUUID(), username: 'test', displayName: 'Uji', roles: ['admin' as const], csrfToken: 'test' };
const content = { victimName: 'Korban Uji', victimNik: '0000000000000001', relation: 'Diri sendiri', story: 'Keterangan sintetis untuk pengujian integrasi.', incidentTime: 'Belum diketahui', incidentLocation: 'Belum diketahui', need: 'Pendampingan', safeContact: 'no' as const, contactDetails: '' };

function cookieJar() {
	const values = new Map<string, string>();
	return { get: (name: string) => values.get(name), set: (name: string, value: string) => values.set(name, value), delete: (name: string) => values.delete(name) } as unknown as Cookies;
}
async function reporter() {
	const cookies = cookieJar();
	const session = await sessions.createSession(cookies, 'ai');
	return { cookies, session };
}
async function userMessage(sessionId: string) {
	const body = crypto.encrypt('Cerita sintetis di rumah.', 'chat_message');
	await db.query("INSERT INTO chat_messages (id, session_id, sender_type, source, body_enc, body_iv, body_tag) VALUES ($1,$2,'user','user',$3,$4,$5)", [randomUUID(), sessionId, body.encrypted, body.iv, body.tag]);
}
beforeAll(async () => {
	if (!originalUrl) throw new Error('DATABASE_URL diperlukan untuk tes integrasi.');
	process.env.REPORT_DATA_KEY ||= randomBytes(32).toString('base64');
	process.env.NIK_DATA_KEY ||= randomBytes(32).toString('base64');
	await admin.connect();
	await admin.query(`CREATE SCHEMA ${schema}`);
	const url = new URL(originalUrl); url.searchParams.set('options', `-c search_path=${schema}`);
	process.env.DATABASE_URL = url.toString();
	({ db } = await import('../../src/lib/server/db'));
	for (const migration of ['001_initial.sql', '002_chat_transcript.sql', '003_staff_handoff.sql', '004_staff_assistance.sql']) await db.query(await readFile(new URL(`../../db/${migration}`, import.meta.url), 'utf8'));
	reports = await import('../../src/lib/server/reports');
	sessions = await import('../../src/lib/server/session');
	handoffs = await import('../../src/lib/server/handoffs');
	crypto = await import('../../src/lib/server/crypto');
	turn = await import('../../src/routes/api/chat/turn/+server');
	await db.query("INSERT INTO staff_users (id, username, display_name, password_hash) VALUES ($1,'test','Uji','unused')", [staffId]);
	await db.query("INSERT INTO staff_roles (staff_id, role) VALUES ($1, 'admin')", [staffId]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => {
	if (db) await db.end();
	await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
	await admin.end();
	process.env.DATABASE_URL = originalUrl;
});

describe('lifecycle database', () => {
	it.runIf(process.env.TEST_LIVE_AI === 'true')('NVIDIA pendamping membaca kutipan sintetis', async () => {
		const { makeStaffAssistance } = await import('../../src/lib/server/assistance-ai');
		const result = await makeStaffAssistance([{ id: randomUUID(), source: 'user', sender: 'user', body: 'Kejadian itu berlangsung kemarin sore di rumah. Saya ingin pendampingan petugas.', createdAt: new Date().toISOString() }]);
		expect(result.source).toBe('nvidia');
		expect(result.fields.incidentTime.status).toBe('found');
		expect(result.fields.incidentLocation.quote).toContain('rumah');
		expect(result.fields.need.quote).toContain('pendampingan');
	}, 25_000);
	it('panduan petugas membatasi akses, tidak menambah balasan, dan mengenkripsi hasil', async () => {
		vi.stubEnv('AI_ENABLED', 'false');
		const { session } = await reporter(); await userMessage(session.id);
		const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
		await expect(handoffs.getStaffChatAssistance({ ...staff, staffId: randomUUID(), roles: ['petugas'] }, handoff.id)).rejects.toMatchObject({ status: 403 });
		const before = await handoffs.getStaffChatThread(staff, handoff.id);
		const assistance = await handoffs.getStaffChatAssistance(staff, handoff.id);
		expect(assistance.fields.story.quote).toBe('Cerita sintetis di rumah.');
		expect((await handoffs.getStaffChatThread(staff, handoff.id)).messages).toHaveLength(before.messages.length);
		const cached = await handoffs.getStaffChatAssistance(staff, handoff.id);
		expect(cached.updatedAt).toBe(assistance.updatedAt);
		const stored = (await db.query('SELECT content_enc,content_iv,content_tag FROM chat_assistance WHERE session_id=$1', [session.id])).rows[0];
		expect(stored.content_enc.toString()).not.toContain('Cerita sintetis');
		expect(JSON.parse(crypto.decrypt(stored.content_enc, stored.content_iv, stored.content_tag, 'staff_assistance'))).toEqual(assistance);
	});
	it('jawaban kepada petugas masuk ke isian pelapor meskipun ditutup sebelum AI selesai', async () => {
		vi.stubEnv('AI_ENABLED', 'false');
		const { session } = await reporter(); await userMessage(session.id);
		const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
		await handoffs.sendStaffChatMessage(staff, handoff.id, 'Kapan kira-kira kejadian itu terjadi?');
		await handoffs.sendReporterHandoffMessage(session, 'Kemarin sore');
		await handoffs.closeStaffChat(staff, handoff.id);
		expect((await handoffs.getReporterHandoff(session.id)).collectedFields?.incidentTime).toBe('Kemarin sore');
		await expect(handoffs.getStaffChatAssistance(staff, handoff.id)).rejects.toMatchObject({ status: 409 });
	});
	it('jawaban terakhir tetap tersimpan saat pelapor mengakhiri bantuan dan AI masih berjalan', async () => {
		vi.stubEnv('AI_ENABLED', 'false');
		const { session } = await reporter(); await userMessage(session.id);
		const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
		await handoffs.getStaffChatAssistance(staff, handoff.id);
		await handoffs.sendStaffChatMessage(staff, handoff.id, 'Kapan kira-kira kejadian itu terjadi?');
		await handoffs.sendReporterHandoffMessage(session, 'Kemarin sore');
		let release!: (value: Response) => void; let started!: () => void;
		const pending = new Promise<void>((resolve) => { started = resolve; });
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>((resolve) => { release = resolve; }); }));
		const result = handoffs.getStaffChatAssistance(staff, handoff.id);
		const assertion = expect(result).rejects.toMatchObject({ code: 'handoff_not_active' });
		await pending;
		await handoffs.cancelReporterHandoff(session);
		expect((await handoffs.getReporterHandoff(session.id)).collectedFields?.incidentTime).toBe('Kemarin sore');
		release(Response.json({ choices: [{ message: { content: '{"fields":{}}' } }] }));
		await assertion;
		expect((await handoffs.getReporterHandoff(session.id)).collectedFields?.incidentTime).toBe('Kemarin sore');
	});
	it('hasil AI lama ditolak bila ada pesan baru dan tidak membocorkan pola identitas ke provider', async () => {
		const { session } = await reporter(); await userMessage(session.id);
		const { handoff } = await handoffs.takeoverChatSession(staff, session.id);
		await handoffs.sendReporterHandoffMessage(session, 'Nama saya Ayu Lestari. NIK 0000000000000001.');
		let release!: (value: Response) => void; let started!: () => void;
		const pending = new Promise<void>((resolve) => { started = resolve; });
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		const provider = vi.fn((_url: string, options: RequestInit) => { expect(options.body as string).not.toMatch(/0000000000000001|Ayu Lestari/); started(); return new Promise<Response>((resolve) => { release = resolve; }); });
		vi.stubGlobal('fetch', provider);
		const result = handoffs.getStaffChatAssistance(staff, handoff.id);
		const assertion = expect(result).rejects.toMatchObject({ code: 'assistance_stale' });
		await pending;
		await handoffs.sendReporterHandoffMessage(session, 'Ada keterangan tambahan setelah panduan mulai dibuat.');
		release(Response.json({ choices: [{ message: { content: '{"fields":{}}' } }] }));
		await assertion;
		expect((await db.query('SELECT 1 FROM chat_assistance WHERE session_id=$1', [session.id])).rowCount).toBe(0);
	});
	it('menolak pembacaan identitas dan ekspor oleh akun tanpa admin', async () => {
		const { session } = await reporter();
		const draft = await reports.createDraft(session.id, content);
		const report = await reports.submitReport(session, { ...draft, idempotencyKey: randomUUID() });
		const outsider = { ...staff, roles: ['bidan_pic' as const] };
		await expect(reports.getReportNik(outsider, report.referenceCode)).rejects.toMatchObject({ status: 403 });
		await expect(reports.getNikDirectory(outsider)).rejects.toMatchObject({ status: 403 });
		await expect(reports.getRecapExportRows(outsider)).rejects.toMatchObject({ status: 403 });
		await expect(reports.getReportTranscript(outsider, report.referenceCode)).rejects.toMatchObject({ status: 404 });
	});
	it('pelapor tidak dapat mengirim draf sesi orang lain', async () => {
		const first = await reporter(); const second = await reporter();
		const draft = await reports.createDraft(first.session.id, content);
		await expect(reports.submitReport(second.session, { ...draft, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 422 });
	});
	it('percobaan login bersamaan tetap mengunci akun setelah lima kegagalan', async () => {
		const auth = await import('../../src/lib/server/staff-auth');
		const id = randomUUID();
		await db.query("INSERT INTO staff_users (id, username, display_name, password_hash) VALUES ($1,'login-test','Uji',$2)", [id, crypto.hashPassword(randomUUID())]);
		await Promise.all(Array.from({ length: 7 }, () => auth.authenticateStaff('login-test', 'incorrect', { clientKey: 'test' })));
		const result = await db.query('SELECT failed_login_attempts, locked_until FROM staff_users WHERE id = $1', [id]);
		expect(result.rows[0].failed_login_attempts).toBeGreaterThanOrEqual(5);
		expect(result.rows[0].locked_until.getTime()).toBeGreaterThan(Date.now());
	});
	it('sesi staff tidak berlaku setelah akun dinonaktifkan atau sesi dicabut', async () => {
		const auth = await import('../../src/lib/server/staff-auth');
		const cookies = cookieJar();
		await auth.createStaffSession(cookies, staffId);
		expect(await auth.getStaffSession(cookies)).not.toBeNull();
		await db.query('UPDATE staff_users SET active = false WHERE id = $1', [staffId]);
		expect(await auth.getStaffSession(cookies)).toBeNull();
		await db.query('UPDATE staff_users SET active = true WHERE id = $1', [staffId]);
		await auth.destroyStaffSession(cookies);
		expect(await auth.getStaffSession(cookies)).toBeNull();
	});
	it.runIf(process.env.TEST_LIVE_AI === 'true')('NVIDIA live mengekstrak keterangan sintetis', async () => {
		const { makeChatTurn } = await import('../../src/lib/server/ai');
		const result = await makeChatTurn({ fields: { incidentTime: '', incidentLocation: '', need: '' }, story: 'Kejadian itu kemarin sore di rumah. Saya ingin pendampingan.', lastAnswer: 'Kejadian itu kemarin sore di rumah. Saya ingin pendampingan.' });
		expect(result.source).toBe('nvidia');
		expect(result.fields?.incidentTime).toContain('kemarin');
		expect(result.fields?.incidentLocation).toContain('rumah');
		expect(result.fields?.need).toContain('pendampingan');
	});
	it('menyimpan draf bersamaan dengan versi berbeda', async () => {
		const { session } = await reporter();
		const drafts = await Promise.all([reports.createDraft(session.id, content), reports.createDraft(session.id, content)]);
		expect(drafts.map((draft) => draft.version).sort()).toEqual([1, 2]);
	});
	it('menolak simpan dan submit sesudah sesi ditutup', async () => {
		const { session, cookies } = await reporter();
		const draft = await reports.createDraft(session.id, content);
		await sessions.endSession(cookies);
		await expect(reports.createDraft(session.id, content)).rejects.toMatchObject({ status: 401 });
		await expect(reports.submitReport(session, { ...draft, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
	});
	it('menolak draf kedaluwarsa dan sesi kedaluwarsa', async () => {
		const { session } = await reporter();
		const draft = await reports.createDraft(session.id, content);
		await db.query("UPDATE report_drafts SET expires_at = now() - interval '1 second' WHERE id = $1", [draft.draftId]);
		await expect(reports.submitReport(session, { ...draft, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 422 });
		await db.query("UPDATE chat_sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [session.id]);
		await expect(reports.createDraft(session.id, content)).rejects.toMatchObject({ status: 401 });
	});
	it('submit bersamaan menghasilkan satu laporan dan satu outbox', async () => {
		const { session } = await reporter();
		const draft = await reports.createDraft(session.id, content);
		const input = { ...draft, idempotencyKey: randomUUID() };
		const result = await Promise.all([reports.submitReport(session, input), reports.submitReport(session, input)]);
		expect(result[0].referenceCode).toBe(result[1].referenceCode);
		const count = await db.query('SELECT count(*)::int AS count FROM notification_outbox n JOIN reports r ON r.id=n.report_id WHERE r.source_session_id=$1', [session.id]);
		expect(count.rows[0].count).toBe(1);
	});
	it('sesi kembali ke daftar ambil alih setelah handoff ditutup', async () => {
		const { session } = await reporter(); await userMessage(session.id);
		const first = await handoffs.takeoverChatSession(staff, session.id);
		await handoffs.sendReporterHandoffMessage(session, 'Keterangan tambahan dari pelapor.');
		const thread = await handoffs.getReporterHandoff(session.id);
		expect(thread.messages.some((message) => message.body.includes('Keterangan tambahan'))).toBe(true);
		await handoffs.closeStaffChat(staff, first.handoff.id);
		expect((await handoffs.getActiveChatSessions(staff)).some((chat) => chat.sessionId === session.id)).toBe(true);
		const second = await handoffs.takeoverChatSession(staff, session.id);
		expect(second.handoff.id).not.toBe(first.handoff.id);
	});
	it('tidak menyimpan balasan AI yang selesai sesudah keluar cepat', async () => {
		const { cookies, session } = await reporter();
		let release!: (value: Response) => void;
		let started!: () => void;
		const pending = new Promise<void>((resolve) => { started = resolve; });
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>((resolve) => { release = resolve; }); }));
		const response = turn.POST({ cookies, request: new Request('http://localhost/api/chat/turn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify({ story: content.story, userMessage: content.story }) }), locals: { requestId: randomUUID() } } as Parameters<typeof turn.POST>[0]);
		await pending;
		await sessions.endSession(cookies);
		release(Response.json({ choices: [{ message: { content: '{}' } }] }));
		expect((await response).status).toBe(401);
		expect((await db.query('SELECT count(*)::int AS count FROM chat_messages WHERE session_id=$1', [session.id])).rows[0].count).toBe(0);
	});
	it('meneruskan pesan ke handoff yang dibuka saat AI masih bekerja', async () => {
		const { cookies, session } = await reporter(); await userMessage(session.id);
		let release!: (value: Response) => void;
		let started!: () => void;
		const pending = new Promise<void>((resolve) => { started = resolve; });
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>((resolve) => { release = resolve; }); }));
		const response = turn.POST({ cookies, request: new Request('http://localhost/api/chat/turn', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify({ story: content.story, userMessage: 'Ada keterangan tambahan saat pengambilalihan.' }) }), locals: { requestId: randomUUID() } } as Parameters<typeof turn.POST>[0]);
		await pending;
		await handoffs.takeoverChatSession(staff, session.id);
		release(Response.json({ choices: [{ message: { content: '{}' } }] }));
		const result = await response;
		expect(result.status).toBe(409);
		const payload = await result.json();
		expect(payload.accepted).toBe(true);
		const thread = await handoffs.getReporterHandoff(session.id);
		expect(thread.messages.some((message) => message.id === payload.userMessageId && message.body.includes('Ada keterangan tambahan'))).toBe(true);
		expect((await db.query("SELECT count(*)::int AS count FROM chat_messages WHERE session_id=$1 AND sender_type='assistant'", [session.id])).rows[0].count).toBe(0);
	});
});
