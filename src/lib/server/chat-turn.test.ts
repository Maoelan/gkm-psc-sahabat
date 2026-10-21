import { afterEach, describe, expect, it, vi } from 'vitest';
import { directAnswerFields, extractQuotedFields, makeChatTurn } from './ai';

const empty = { incidentTime: '', incidentLocation: '', need: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('pemahaman keterangan', () => {
	it('menolak kutipan buatan, ketidakpastian, dan lokasi saat ini', () => {
		expect(extractQuotedFields(empty, { incidentTime: 'malam', incidentLocation: 'rumah', need: 'bantuan' }, 'Saya takut pulang malam, kejadiannya saya lupa kapan. Saya belum tahu bantuan yang saya perlukan. Sekarang saya di rumah.')).toEqual(empty);
		expect(extractQuotedFields(empty, { incidentLocation: 'sekolah' }, 'Saya di rumah.')).toEqual(empty);
	});
	it('mengekstrak kutipan nyata tanpa mengisi ulang field yang sudah dilewati', () => {
		const fields = extractQuotedFields({ ...empty, incidentTime: 'Belum diketahui' }, { incidentTime: 'kemarin', incidentLocation: 'di rumah', need: 'pendampingan' }, 'Kejadian kemarin di rumah. Saya ingin pendampingan.');
		expect(fields).toEqual({ incidentTime: 'Belum diketahui', incidentLocation: 'di rumah', need: 'pendampingan' });
	});
	it('membedakan permintaan dukungan dan pertanyaan layanan pada fallback', () => {
		expect(directAnswerFields(empty, 'Saya ingin pendampingan petugas', 'need').need).toBe('Saya ingin pendampingan petugas');
		expect(directAnswerFields(empty, 'Siapa yang bisa melihat laporan?', 'incidentTime')).toEqual(empty);
		expect(directAnswerFields(empty, 'Saya belum tahu', 'need').need).toBe('Belum diketahui');
		expect(directAnswerFields(empty, 'x'.repeat(161), 'incidentTime')).toEqual(empty);
	});
	it('menghitung pertanyaan berikutnya dari field hasil model yang tervalidasi', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ reply: 'Keterangan sudah dicatat.', extracted_fields: { incidentTime: 'kemarin', incidentLocation: 'di rumah', need: 'pendampingan' }, next_field: null, question: null }) } }] })));
		const result = await makeChatTurn({ fields: empty, story: 'Kejadian kemarin di rumah. Saya ingin pendampingan.' });
		expect(result.flowComplete).toBe(true);
		expect(result.fields).toEqual({ incidentTime: 'kemarin', incidentLocation: 'di rumah', need: 'pendampingan' });
		expect(result.source).toBe('nvidia');
	});
	it('memakai fallback saat provider gagal dan tetap membatasi isian field', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
		const result = await makeChatTurn({ fields: empty, story: 'Cerita kejadian untuk uji.', lastAnswer: 'Kemarin sore', answerField: 'incidentTime' });
		expect(result.source).toBe('fallback');
		expect(result.fields?.incidentTime).toBe('Kemarin sore');
		expect(result.missingField).toBe('incident_location');
	});
	it('fallback keluaran model tidak mengisi ulang field yang dinilai belum jelas', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ reply: '', extracted_fields: { incidentTime: null }, next_field: 'incident_time', question: 'Boleh sebutkan nama Anda?' }) } }] })));
		const result = await makeChatTurn({ fields: empty, story: 'Saya takut pulang malam.', lastAnswer: 'Saya takut pulang malam.', answerField: 'incidentTime' });
		expect(result.fields?.incidentTime).toBe('');
		expect(result.source).toBe('fallback');
	});
});
