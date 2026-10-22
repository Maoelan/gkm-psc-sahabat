import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistanceMessages, fallbackStaffAssistance, makeStaffAssistance, parseStaffAssistance } from './assistance-ai';
import { collectedChatFields } from '../assistance';
import type { HandoffThreadMessage } from '../handoff';
import { fallbackFollowUp } from './ai';

const user = (id: string, body: string): HandoffThreadMessage => ({ id, body, source: 'user', sender: 'user', createdAt: '2026-10-22T00:00:00Z' });
const staff = (id: string, body: string): HandoffThreadMessage => ({ ...user(id, body), source: 'staff', sender: 'staff' });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('pendamping petugas', () => {
	it('tidak mengubah persetujuan singkat menjadi waktu atau cerita kejadian', () => {
		const result = parseStaffAssistance(JSON.stringify({ fields: { incidentTime: { quote: 'Iya', messageId: '1' }, story: { quote: 'Iya', messageId: '1' } } }), [user('1', 'Iya')]);
		expect(result.fields.incidentTime.status).toBe('missing');
		expect(result.fields.story.status).toBe('missing');
	});
	it('mengenali pertanyaan cadangan yang diedit dan diikuti kalimat bantuan', () => {
		const question = 'Untuk melengkapi catatan, ' + fallbackFollowUp('incident_time');
		const result = fallbackStaffAssistance([staff('1', question), user('2', 'Kemarin pagi')]);
		expect(result.fields.incidentTime.quote).toBe('Kemarin pagi');
	});
	it('menghormati pelapor yang belum siap tanpa menganggapnya jawaban faktual', () => {
		const result = fallbackStaffAssistance([user('1', 'Saya mengalami kejadian kekerasan.'), staff('2', 'Kapan kejadian itu terjadi?'), user('3', 'Saya belum siap menjawab')]);
		expect(result.fields.incidentTime.status).toBe('unknown');
		expect(result.suggestion?.field).toBe('incidentLocation');
	});
	it('mengumpulkan jawaban terhadap pertanyaan petugas dan menyisakan topik berikutnya', () => {
		const result = fallbackStaffAssistance([user('1', 'Saya mengalami kekerasan oleh orang yang saya kenal.'), staff('2', 'Kapan kira-kira kejadian itu terjadi?'), user('3', 'Kemarin sore')]);
		expect(result.fields.incidentTime).toMatchObject({ quote: 'Kemarin sore', messageId: '3', status: 'found' });
		expect(result.suggestion?.field).toBe('incidentLocation');
	});
	it('tidak menganggap kebutuhan atau pertanyaan layanan sebagai cerita kejadian', () => {
		const result = fallbackStaffAssistance([user('1', 'Siapa yang dapat melihat laporan?'), staff('2', 'Bantuan apa yang Anda harapkan?'), user('3', 'Saya ingin pendampingan petugas')]);
		expect(result.fields.story.status).toBe('missing');
		expect(result.fields.need.quote).toBe('Saya ingin pendampingan petugas');
	});
	it('menandai jawaban belum tahu dan tidak menanyakan topik itu kembali', () => {
		const result = fallbackStaffAssistance([user('1', 'Saya mengalami kejadian kekerasan.'), staff('2', 'Kapan kejadian itu terjadi?'), user('3', 'Saya tidak ingat')]);
		expect(result.fields.incidentTime.status).toBe('unknown');
		expect(result.suggestion?.field).toBe('incidentLocation');
		expect(collectedChatFields(result).incidentTime).toBe('Belum diketahui');
	});
	it('menolak kutipan rekaan, pesan petugas, identitas dan konteks lokasi saat ini', () => {
		const messages = [user('1', 'Saya mengalami kejadian kekerasan.'), staff('2', 'Kejadian berlangsung kemarin.'), user('3', 'Sekarang saya di rumah.'), user('4', '[NIK dihapus]')];
		const result = parseStaffAssistance(JSON.stringify({ fields: {
			incidentTime: { quote: 'kemarin', messageId: '2' }, incidentLocation: { quote: 'di rumah', messageId: '3' },
			need: { quote: '[NIK dihapus]', messageId: '4' }, story: { quote: 'Kejadian rekaan', messageId: '1' }
		} }), messages);
		expect(result.fields.incidentTime.status).toBe('missing');
		expect(result.fields.incidentLocation.status).toBe('missing');
		expect(result.fields.need.status).toBe('missing');
		expect(result.fields.story.quote).toBe(messages[0].body);
	});
	it('menerima kutipan tepat dari pesan pelapor dan menolak pertanyaan tentang identitas', () => {
		const result = parseStaffAssistance(JSON.stringify({ fields: { incidentLocation: { quote: 'di rumah', messageId: '1' } }, suggestion: { field: 'need', question: 'Bantuan apa yang Anda harapkan dan berapa nomor telepon Anda?' } }), [user('1', 'Kejadian itu berlangsung di rumah.')]);
		expect(result.fields.incidentLocation.quote).toBe('di rumah');
		expect(result.suggestion?.question).not.toContain('telepon');
		expect(collectedChatFields(result).incidentLocation).toBe('di rumah');
	});
	it('tidak mengganti jawaban terbaru dengan kutipan lama', () => {
		const messages = [staff('1', 'Kapan kejadian itu terjadi?'), user('2', 'Kemarin'), staff('3', 'Kapan kira-kira kejadian itu terjadi?'), user('4', 'Dua hari lalu')];
		const result = parseStaffAssistance(JSON.stringify({ fields: { incidentTime: { quote: 'Kemarin', messageId: '2' } } }), messages);
		expect(result.fields.incidentTime.quote).toBe('Dua hari lalu');
	});
	it('membatasi konteks dan meredaksi identitas sebelum dikirim ke provider', () => {
		const messages = Array.from({ length: 60 }, (_, i) => user(String(i), 'Nama saya Ayu Lestari. NIK 0000000000000001, email ayu@example.test.'));
		const safe = assistanceMessages(messages);
		expect(safe).toHaveLength(40);
		expect(safe[0].id).toBe('0'); expect(safe.at(-1)?.id).toBe('59');
		expect(JSON.stringify(safe)).not.toMatch(/0000000000000001|Ayu Lestari|ayu@example/);
	});
	it('kegagalan provider tetap memberi panduan cadangan tanpa mengirim pesan pelapor', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
		const result = await makeStaffAssistance([user('1', 'Saya mengalami kejadian kekerasan.')]);
		expect(result.source).toBe('fallback');
		expect(result.suggestion?.field).toBe('incidentTime');
	});
});
