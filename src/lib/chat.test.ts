import { describe, expect, it } from 'vitest';
import { appendReportStory, isServiceQuestion, reportContribution, STORY_LIMIT } from './chat';
import { draftSchema, chatTurnSchema } from './server/validation';

describe('keterangan pelapor', () => {
	it('menyimpan tambahan dari chat bebas dan manusia tanpa pertanyaan layanan', () => {
		let story = 'Saya mengalami kekerasan kemarin.';
		story = appendReportStory(story, 'Lengan saya juga terluka.');
		story = appendReportStory(story, 'Siapa yang bisa melihat laporan?');
		story = appendReportStory(story, 'Saya ingin pendampingan petugas');
		expect(story).toContain('Lengan saya juga terluka.');
		expect(story).toContain('Saya ingin pendampingan petugas');
		expect(story).not.toContain('Siapa yang');
		expect(isServiceQuestion('Saya ingin pendampingan petugas')).toBe(false);
	});
	it('memisahkan pertanyaan layanan dan cerita dalam satu pesan', () => {
		expect(reportContribution('Siapa yang membaca laporan? Saya dipukul lagi kemarin.')).toBe('Saya dipukul lagi kemarin.');
		expect(reportContribution('Terima kasih.')).toBe('');
		expect(reportContribution('Belum diketahui')).toBe('');
	});
	it('mempertahankan fakta yang menyebut petugas tanpa menganggapnya pertanyaan akses', () => {
		expect(reportContribution('Petugas melihat kejadian tersebut.')).toBe('Petugas melihat kejadian tersebut.');
		expect(reportContribution('Saya ingin tahu siapa yang membaca laporan')).toBe('');
	});
	it('menolak tambahan melebihi kapasitas tanpa memotong cerita', () => {
		const story = 'x'.repeat(STORY_LIMIT);
		expect(() => appendReportStory(story, 'Ada tambahan.')).toThrow('karakter');
		expect(story).toHaveLength(STORY_LIMIT);
	});
	it('memakai batas cerita yang sama pada giliran chat dan draf', () => {
		const payload = { story: 'x'.repeat(STORY_LIMIT), victimName: 'Uji', victimNik: '', relation: 'Diri sendiri', safeContact: 'no' };
		expect(chatTurnSchema.safeParse(payload).success).toBe(true);
		expect(draftSchema.safeParse(payload).success).toBe(true);
		expect(chatTurnSchema.safeParse({ ...payload, story: payload.story + 'x' }).success).toBe(false);
		expect(draftSchema.safeParse({ ...payload, story: payload.story + 'x' }).success).toBe(false);
	});
});
