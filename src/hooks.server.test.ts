import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
const attempts = vi.hoisted(() => vi.fn());
vi.mock('./lib/server/rate-limit', () => ({ allowAttempt: attempts }));
beforeEach(() => { attempts.mockReset(); });
describe('shared request limits', () => {
  it('fails closed with security headers when shared storage is unavailable', async () => {
    attempts.mockRejectedValue(new Error('private backend details'));
    const resolve = vi.fn();
    const response = await handle({ event: { request: new Request('https://evaluation.example.test/api/chat/session', { method: 'POST' }), url: new URL('https://evaluation.example.test/api/chat/session'), locals: {}, getClientAddress: () => '127.0.0.1' }, resolve } as unknown as Parameters<typeof handle>[0]);
    expect(response.status).toBe(503); expect(resolve).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toContain('no-store'); expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(await response.text()).not.toContain('private backend details');
  });
  it('rejects a cross-origin write before contacting storage', async () => {
    const resolve = vi.fn();
    const response = await handle({ event: { request: new Request('https://evaluation.example.test/api/chat/session', { method: 'POST', headers: { Origin: 'https://outside.example.test' } }), url: new URL('https://evaluation.example.test/api/chat/session'), locals: {} }, resolve } as unknown as Parameters<typeof handle>[0]);
    expect(response.status).toBe(403); expect(attempts).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
  });
});
