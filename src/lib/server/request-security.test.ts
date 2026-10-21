import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedRequest, MAX_REQUEST_BYTES, requestOriginAllowed } from './request-security';
import { requireCsrf } from './staff-api';
import { encrypt, decrypt, hashPassword, verifyPassword } from './crypto';
import { secureCookies } from './env';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('batas permintaan', () => {
	it('menolak cross-site dan origin berbeda, termasuk saat token CSRF cocok', () => {
		const staff = { sessionId: 'test', staffId: 'test', username: 'test', displayName: 'test', roles: [], csrfToken: 'valid' };
		for (const [name, value] of [['origin', 'https://outside.test'], ['sec-fetch-site', 'cross-site']]) {
			const request = new Request('https://lapor.test/api/staff/logout', { method: 'POST', headers: { [name]: value, 'x-csrf-token': 'valid' } });
			expect(requestOriginAllowed(request)).toBe(false);
			expect(requireCsrf(request, staff)?.status).toBe(403);
		}
	});
	it('menolak token kosong/salah dan menerima permintaan asal yang sama', () => {
		const staff = { sessionId: 'test', staffId: 'test', username: 'test', displayName: 'test', roles: [], csrfToken: 'valid' };
		expect(requireCsrf(new Request('https://lapor.test/'), staff)?.status).toBe(403);
		expect(requireCsrf(new Request('https://lapor.test/', { headers: { origin: 'https://lapor.test', 'x-csrf-token': 'valid' } }), staff)).toBeNull();
	});
	it('membatasi body berdasarkan byte aktual meski tanpa Content-Length', async () => {
		const request = new Request('https://lapor.test/api/chat/turn', { method: 'POST', body: 'x'.repeat(MAX_REQUEST_BYTES + 1) });
		await expect(boundedRequest(request)).rejects.toMatchObject({ status: 413 });
	});
	it('tetap menyediakan body untuk JSON/form parser setelah pemeriksaan', async () => {
		const request = new Request('https://lapor.test/api/chat/turn', { method: 'POST', body: JSON.stringify({ story: 'Keterangan sintetis.' }), headers: { 'Content-Type': 'application/json' } });
		expect(await (await boundedRequest(request)).json()).toEqual({ story: 'Keterangan sintetis.' });
	});
	it('menghentikan pembacaan body yang macet', async () => {
		vi.useFakeTimers();
		const stream = new ReadableStream({ start() {} });
		const request = new Request('https://lapor.test/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
		const assertion = expect(boundedRequest(request)).rejects.toMatchObject({ status: 408 });
		await vi.advanceTimersByTimeAsync(10_001);
		await assertion;
	});
});

describe('enkripsi dan kata sandi', () => {
	it('mewajibkan HTTPS di luar loopback dan mengaktifkan Secure untuk HTTPS', () => {
		vi.stubEnv('PUBLIC_BASE_URL', 'http://public.example.test');
		expect(() => secureCookies()).toThrow('HTTPS');
		vi.stubEnv('PUBLIC_BASE_URL', 'https://public.example.test');
		expect(secureCookies()).toBe(true);
		vi.stubEnv('PUBLIC_BASE_URL', 'http://127.0.0.1:5173');
		expect(secureCookies()).toBe(false);
	});
	it('menolak ciphertext yang diubah dan penggunaan tujuan yang berbeda', () => {
		vi.stubEnv('REPORT_DATA_KEY', Buffer.alloc(32, 7).toString('base64'));
		const value = encrypt('Keterangan sintetis.', 'report_content');
		expect(() => decrypt(value.encrypted, value.iv, value.tag, 'victim_name')).toThrow();
		value.encrypted[0] ^= 1;
		expect(() => decrypt(value.encrypted, value.iv, value.tag, 'report_content')).toThrow();
	});
	it('memverifikasi hash dan menolak kata sandi lain', () => {
		const hash = hashPassword('test-only-password');
		expect(verifyPassword('test-only-password', hash)).toBe(true);
		expect(verifyPassword('wrong-password', hash)).toBe(false);
	});
});
