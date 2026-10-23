import { afterEach, describe, expect, it, vi } from 'vitest';
import { directAnswerFields, extractQuotedFields, makeChatTurn } from './ai';

const empty = { incidentTime: '', incidentLocation: '', need: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('pemahaman keterangan', () => {
	it('mempertahankan jawaban layanan yang aman saat pertanyaan model harus diganti', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({
			reply: 'Laporan dapat dibaca oleh petugas yang ditugaskan dan admin.',
			extracted_fields: {}, next_field: null, question: 'Boleh sebutkan nama lengkap Anda?'
		}) } }] })));
		const result = await makeChatTurn({ fields: empty, story: 'Saya mengalami ancaman.', lastAnswer: 'Siapa yang bisa membaca laporan?' });
		expect(result.source).toBe('nvidia');
		expect(result.reply).toContain('admin');
		expect(result.question).toBe('Kapan kira-kira kejadian itu terjadi? Perkiraan waktu sudah cukup.');
		expect(result.message).not.toContain('nama lengkap');
		expect(result.fields).toEqual(empty);
	});
	it('mencatat penyebab fallback tanpa isi percakapan atau kredensial', async () => {
		vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'private-test-key');
		vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const result = await makeChatTurn({ fields: empty, story: 'Cerita privat untuk pengujian.' });
			expect(result.source).toBe('fallback');
			expect(warning.mock.calls).toEqual([['AI chat fallback', { reason: 'provider_http', status: 429 }]]);
		} finally { warning.mockRestore(); }
	});
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


describe('percakapan pendampingan', () => {
    it('mencatat kebutuhan eksplisit meskipun model gagal mengekstrak dan bertanya ulang', async () => {
        vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
        const answer = 'saya butuh pendampingan, jadi bantu aku untuk menangani masalah ini karena saya takut';
        const fetch = vi.fn(async (..._args: any[]) => Response.json({ choices: [{ message: { content: JSON.stringify({ reply: 'Saya mencatat kebutuhan pendampingan Anda.', extracted_fields: { need: null }, next_field: 'need', question: 'Bantuan atau dukungan apa yang Anda harapkan setelah kejadian ini?' }) } }] }));
        vi.stubGlobal('fetch', fetch);
        const result = await makeChatTurn({ fields: { incidentTime: 'tadi siang', incidentLocation: 'dirumah', need: '' }, story: answer, lastAnswer: answer, answerField: 'need' });
        expect(result.fields?.need).toBe(answer);
        expect(result.flowComplete).toBe(true);
        expect(result.question).toBeNull();
        expect(result.message).not.toContain('apa yang Anda harapkan');
        expect(result.message).toContain('takut');
        expect(result.message).toContain('Selesai');
        const sent = JSON.parse(fetch.mock.calls[0][1].body);
        expect(sent.messages[0].content).toContain('reply wajib mengakui');
    });
    it('tetap menanggapi cerita saat provider tidak tersedia', async () => {
        vi.stubEnv('AI_ENABLED', 'false');
        const result = await makeChatTurn({ fields: empty, story: 'Saya mengalami KDRT dari suami saya', lastAnswer: 'Saya mengalami KDRT dari suami saya' });
        expect(result.source).toBe('fallback');
        expect(result.reply).toContain('bukan kesalahan Anda');
        expect(result.question).toContain('Kapan');
    });
    it('tidak mengulang instruksi selesai setelah pertanyaan layanan', async () => {
        vi.stubEnv('AI_ENABLED', 'true'); vi.stubEnv('NVIDIA_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ reply: 'Kebutuhan pendampingan Anda dapat ditinjau petugas setelah laporan dikirim. Saya belum bisa memastikan hasilnya.', extracted_fields: {}, next_field: null, question: 'Bantuan apa yang Anda harapkan?' }) } }] })));
        const result = await makeChatTurn({ fields: { incidentTime: 'tadi siang', incidentLocation: 'di rumah', need: 'pendampingan' }, story: 'KDRT', lastAnswer: 'Apakah petugas kemungkinan besar akan membantuku??' });
        expect(result.question).toBeNull();
        expect(result.message).not.toContain('Selesai');
    });
});


it('a skipped time answer does not silently skip the need field', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    const result = await makeChatTurn({ fields: empty, story: 'Cerita sintetis.', lastAnswer: 'Saya belum tahu', answerField: 'incidentTime' });
    expect(result.fields?.incidentTime).toBe('Belum diketahui');
    expect(result.fields?.need).toBe('');
    expect(result.missingField).toBe('incident_location');
});
