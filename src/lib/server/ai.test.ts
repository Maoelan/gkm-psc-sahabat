import { describe, expect, it } from 'vitest';
import {
	FLOW_COMPLETE_MESSAGE,
	fallbackChatTurn,
	fallbackFollowUp,
	isSafeOptionalQuestion,
	isSafeQuestionForField,
	isSafeReply,
	missingChatField,
	redactSensitive,
	remainingChatFields
} from './ai';

describe('redactSensitive', () => {
	it('menghapus NIK, nomor, email, dan nama yang berpola jelas', () => {
		const result = redactSensitive(
			'Nama saya Ayu Lestari. NIK 0000000000000001, telepon 0812-3456-7890 atau +62 812-3456-7890, email ayu@example.test.'
		);
		expect(result).not.toContain('0000000000000001');
		expect(result).not.toContain('0812-3456-7890');
		expect(result).not.toContain('+62 812-3456-7890');
		expect(result).not.toContain('ayu@example.test');
		expect(result).not.toContain('Ayu Lestari');
		expect(result).toContain('[NIK dihapus]');
		expect(result).toContain('[nomor dihapus]');
		expect(result).toContain('[email dihapus]');
		expect(result).toContain('[nama dihapus]');
	});

	it('membiarkan cerita tanpa pola identitas', () => {
		const story = 'Saya melihat kejadian di tempat umum kemarin malam.';
		expect(redactSensitive(story)).toBe(story);
	});
});

describe('fallbackFollowUp', () => {
	it('selalu menyediakan satu pertanyaan untuk field yang didukung', () => {
		expect(fallbackFollowUp('incident_time')).toContain('Kapan');
		expect(fallbackFollowUp('incident_location')).toContain('Di mana');
		expect(fallbackFollowUp('need')).toContain('Bantuan');
	});
});

describe('missingChatField', () => {
	it('memilih field kosong secara berurutan', () => {
		expect(missingChatField({ incidentTime: '', incidentLocation: '', need: '' })).toBe(
			'incident_time'
		);
		expect(
			missingChatField({
				incidentTime: 'Tercantum dalam cerita',
				incidentLocation: '',
				need: ''
			})
		).toBe('incident_location');
		expect(
			missingChatField({
				incidentTime: 'Tercantum dalam cerita',
				incidentLocation: 'Tercantum dalam cerita',
				need: ''
			})
		).toBe('need');
	});

	it('tidak menanyakan ulang field yang sudah dilewati', () => {
		expect(
			missingChatField({
				incidentTime: 'Belum diketahui',
				incidentLocation: 'Tercantum dalam cerita',
				need: 'Pendampingan'
			})
		).toBe(null);
	});
});

describe('remainingChatFields', () => {
	it('mengembalikan semua field yang belum terisi dalam urutan tetap', () => {
		expect(remainingChatFields({ incidentTime: '', incidentLocation: '', need: '' })).toEqual([
			'incident_time',
			'incident_location',
			'need'
		]);
		expect(
			remainingChatFields({
				incidentTime: 'Kemarin',
				incidentLocation: '',
				need: 'Pendampingan'
			})
		).toEqual(['incident_location']);
	});
});

describe('fallbackChatTurn', () => {
	it('tetap menanyakan field pertama yang belum terisi', () => {
		const result = fallbackChatTurn(['incident_location', 'need']);
		expect(result.flowComplete).toBe(false);
		expect(result.missingField).toBe('incident_location');
		expect(result.message).toBe(fallbackFollowUp('incident_location'));
	});

	it('memberi pesan penutup alur tanpa mengakhiri percakapan', () => {
		const result = fallbackChatTurn([]);
		expect(result.flowComplete).toBe(true);
		expect(result.missingField).toBe(null);
		expect(result.message).toBe(FLOW_COMPLETE_MESSAGE);
		expect(result.message).toContain('Selesai');
	});
});

describe('isSafeReply', () => {
	it('menerima tanggapan faktual tentang alur proyek', () => {
		expect(
			isSafeReply(
				'NIK hanya dapat dibuka bidan/PIC, dan setiap pembukaan dicatat dalam audit.'
			)
		).toBe(true);
		expect(isSafeReply('Saya tidak bisa memberi pendapat pribadi atau nasihat hukum.')).toBe(true);
	});

	it('menolak tautan, HTML, dan kalimat yang memberi nasihat', () => {
		expect(isSafeReply('Lihat https://example.test untuk info.')).toBe(false);
		expect(isSafeReply('Sebaiknya Anda segera melapor ke polisi.')).toBe(false);
		expect(isSafeReply('Anda harus menekan tombol itu.')).toBe(false);
		expect(isSafeReply('<strong>Kirim</strong> sekarang.')).toBe(false);
		expect(isSafeReply('Data Anda aman dan laporan akan segera diproses.')).toBe(false);
		expect(isSafeReply('Saya tidak bisa menjamin keamanan data.')).toBe(true);
	});
});

describe('isSafeOptionalQuestion', () => {
	it('menerima pertanyaan tambahan yang tidak meminta identitas', () => {
		expect(isSafeOptionalQuestion('Apakah ada hal lain yang ingin Anda tambahkan?')).toBe(true);
	});

	it('menolak pertanyaan identitas, nasihat, atau dua pertanyaan sekaligus', () => {
		expect(isSafeOptionalQuestion('Boleh sebutkan nama dan nomor Anda?')).toBe(false);
		expect(isSafeOptionalQuestion('Apakah Anda ingin saran hukum?')).toBe(false);
		expect(isSafeOptionalQuestion('Apakah ada tambahan? Apakah sudah cukup?')).toBe(false);
	});
});

describe('isSafeQuestionForField', () => {
	it('menerima pertanyaan lokasi umum yang baku', () => {
		expect(
			isSafeQuestionForField('Di lokasi umum mana kejadian tersebut terjadi?', 'incident_location')
		).toBe(true);
	});

	it('menerima pertanyaan waktu yang baku', () => {
		expect(isSafeQuestionForField('Kapan kira-kira kejadian itu terjadi?', 'incident_time')).toBe(
			true
		);
	});

	it('menolak pertanyaan waktu saat field yang hilang adalah lokasi', () => {
		expect(
			isSafeQuestionForField('Kapan terjadi kejadian di lokasi umum?', 'incident_location')
		).toBe(false);
	});

	it('menolak pertanyaan lokasi saat field yang hilang adalah waktu', () => {
		expect(isSafeQuestionForField('Di mana lokasi kejadian berlangsung?', 'incident_time')).toBe(
			false
		);
	});

	it('menerima pertanyaan kebutuhan tanpa memberi nasihat', () => {
		expect(
			isSafeQuestionForField('Bantuan atau pendampingan apa yang Anda harapkan?', 'need')
		).toBe(true);
	});

	it('menolak pertanyaan yang meminta identitas atau memberi nasihat', () => {
		expect(isSafeQuestionForField('Boleh sebutkan nama dan nomor Anda?', 'need')).toBe(false);
		expect(isSafeQuestionForField('Apakah Anda butuh saran hukum?', 'need')).toBe(false);
		expect(isSafeQuestionForField('Apakah Anda ingin melapor ke polisi?', 'need')).toBe(false);
	});
});
