import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); });
describe('rate limit', () => {
	it('menolak kelebihan percobaan dan membuka kembali setelah TTL', async () => {
		vi.resetModules(); vi.useFakeTimers();
		const { allowAttempt } = await import('./rate-limit');
		expect(allowAttempt('test', 2, 1000)).toBe(true);
		expect(allowAttempt('test', 2, 1000)).toBe(true);
		expect(allowAttempt('test', 2, 1000)).toBe(false);
		await vi.advanceTimersByTimeAsync(1001);
		expect(allowAttempt('test', 2, 1000)).toBe(true);
	});
	it('membatasi jumlah kunci dan membersihkan kunci kedaluwarsa', async () => {
		vi.resetModules(); vi.useFakeTimers();
		const { allowAttempt } = await import('./rate-limit');
		for (let index = 0; index < 10_000; index++) expect(allowAttempt(`test:${index}`, 1, 1000)).toBe(true);
		expect(allowAttempt('overflow', 1, 1000)).toBe(false);
		await vi.advanceTimersByTimeAsync(60_001);
		expect(allowAttempt('overflow', 1, 1000)).toBe(true);
	});
});
