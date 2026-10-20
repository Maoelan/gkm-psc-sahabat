import { describe, expect, it } from 'vitest';
import { modeFromSchedule } from './service-mode';

const weekday = { weekday: 1, opens_at: '08:00:00', closes_at: '14:00:00', timezone: 'Asia/Makassar' };
const friday = { weekday: 5, opens_at: '08:00:00', closes_at: '11:00:00', timezone: 'Asia/Makassar' };
const saturday = { weekday: 6, opens_at: '08:00:00', closes_at: '12:30:00', timezone: 'Asia/Makassar' };

describe('modeFromSchedule', () => {
	it('menutup layanan operator tepat pukul 14.00 WITA', () => {
		expect(modeFromSchedule(14 * 60, 1, weekday)).toBe('ai');
		expect(modeFromSchedule(14 * 60 - 1, 1, weekday)).toBe('operator');
	});

	it('menutup layanan operator tepat pukul 11.00 WITA pada Jumat', () => {
		expect(modeFromSchedule(11 * 60, 5, friday)).toBe('ai');
		expect(modeFromSchedule(11 * 60 - 1, 5, friday)).toBe('operator');
	});

	it('menutup layanan operator tepat pukul 12.30 WITA pada Sabtu', () => {
		expect(modeFromSchedule(12 * 60 + 30, 6, saturday)).toBe('ai');
		expect(modeFromSchedule(12 * 60 + 29, 6, saturday)).toBe('operator');
	});

	it('memakai mode AI bila tidak ada jadwal hari itu', () => {
		expect(modeFromSchedule(9 * 60, 7, undefined)).toBe('ai');
	});

	it('menghormati pengecualian tutup dan jam khusus', () => {
		expect(
			modeFromSchedule(9 * 60, 1, weekday, { is_closed: true, opens_at: null, closes_at: null })
		).toBe('ai');
		expect(
			modeFromSchedule(9 * 60 + 30, 1, weekday, {
				is_closed: false,
				opens_at: '09:00:00',
				closes_at: '10:00:00'
			})
		).toBe('operator');
		expect(
			modeFromSchedule(10 * 60, 1, weekday, {
				is_closed: false,
				opens_at: '09:00:00',
				closes_at: '10:00:00'
			})
		).toBe('ai');
	});
});
