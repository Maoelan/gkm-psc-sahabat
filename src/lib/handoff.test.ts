import { describe, expect, it } from 'vitest';
import {
	handoffStatusCopy,
	handoffStatusLabel,
	isHandoffOpen,
	type HandoffStatus
} from './handoff';
import { handoffMessageSchema } from './server/validation';

describe('isHandoffOpen', () => {
	it('hanya menganggap waiting dan active sebagai handoff terbuka', () => {
		expect(isHandoffOpen('waiting')).toBe(true);
		expect(isHandoffOpen('active')).toBe(true);
		expect(isHandoffOpen('closed')).toBe(false);
		expect(isHandoffOpen('cancelled')).toBe(false);
		expect(isHandoffOpen(null)).toBe(false);
	});
});

describe('handoff copy', () => {
	it('memberi label yang berbeda untuk setiap status', () => {
		const statuses: HandoffStatus[] = ['waiting', 'active', 'closed', 'cancelled'];
		const labels = new Set(statuses.map(handoffStatusLabel));
		expect(labels.size).toBe(4);
		expect(handoffStatusLabel('waiting')).toContain('Menunggu');
		expect(handoffStatusLabel('active')).toContain('Petugas');
	});

	it('menjelaskan bahwa AI dijeda saat petugas aktif', () => {
		expect(handoffStatusCopy('active').toLowerCase()).toContain('ai dijeda');
	});
});

describe('handoffMessageSchema', () => {
	it('menerima pesan yang sudah dipangkas', () => {
		const parsed = handoffMessageSchema.parse({ body: '  Halo, saya petugas.  ' });
		expect(parsed.body).toBe('Halo, saya petugas.');
	});

	it('menolak pesan kosong atau terlalu panjang', () => {
		expect(handoffMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
		expect(handoffMessageSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
	});
});
