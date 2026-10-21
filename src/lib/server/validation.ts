import { STORY_LIMIT, MESSAGE_LIMIT } from '../chat';
import { z } from 'zod';
import { PRIVACY_NOTICE_VERSION } from '../privacy';

const text = (max: number) => z.string().trim().max(max);

export const draftSchema = z.object({
	victimName: z
		.string()
		.trim()
		.min(2, 'Tulis nama korban atau nama panggilan sedikitnya 2 karakter.')
		.max(80, 'Nama korban terlalu panjang.'),
	victimNik: z
		.string()
		.trim()
		.max(16, 'NIK harus 16 digit angka.')
		.regex(/^\d*$/, 'NIK hanya boleh berisi angka.')
		.refine((value) => value === '' || value.length === 16, 'NIK harus 16 digit angka.'),
	relation: z.enum([
		'Diri sendiri',
		'Keluarga atau pendamping',
		'Pihak lain yang mengetahui kejadian'
	]),
	story: z
		.string()
		.trim()
		.min(10, 'Tulis sedikitnya 10 karakter agar draf bisa disusun.')
		.max(STORY_LIMIT, 'Cerita terlalu panjang.'),
	incidentTime: text(160).default('Belum diketahui'),
	incidentLocation: text(200).default('Belum diketahui'),
	need: text(300).default('Belum diketahui'),
	safeContact: z.enum(['yes', 'no'], { message: 'Pilih preferensi kontak.' }),
	contactDetails: text(500).default('')
});

export const submitSchema = z.object({
	draftId: z.uuid('Draf tidak valid.'),
	version: z.number().int().positive('Versi draf tidak valid.'),
	idempotencyKey: z.uuid('Kunci pengiriman tidak valid.'),
	privacyRead: z.literal(true, { message: 'Konfirmasi privasi wajib dicentang.' }),
	noticeVersion: z.literal(PRIVACY_NOTICE_VERSION, {
		message: 'Pemberitahuan privasi sudah berubah. Muat ulang halaman.'
	})
});

export const chatTurnSchema = z.object({
	story: z.string().trim().min(10, 'Cerita terlalu pendek.').max(STORY_LIMIT, 'Cerita terlalu panjang.'),
	incidentTime: z.string().trim().max(160).default(''),
	incidentLocation: z.string().trim().max(200).default(''),
	need: z.string().trim().max(300).default(''),
	userMessage: z.string().trim().max(MESSAGE_LIMIT).optional(),
	answerField: z.enum(['incidentTime', 'incidentLocation', 'need']).optional()
});

export const handoffMessageSchema = z.object({
	body: z
		.string()
		.trim()
		.min(1, 'Tulis pesan terlebih dahulu.')
		.max(2000, 'Pesan terlalu panjang. Maksimal 2000 karakter.')
});

export const reviewSchema = z.object({
	notes: z
		.string()
		.trim()
		.min(3, 'Tulis catatan pemeriksaan sebelum menyimpan.')
		.max(1000, 'Catatan terlalu panjang.')
});

export const decisionSchema = z.object({
	decision: z.enum(['follow_up_required', 'follow_up_not_required'], {
		message: 'Pilih keputusan.'
	}),
	reason: z
		.string()
		.trim()
		.min(3, 'Alasan keputusan wajib diisi.')
		.max(1000, 'Alasan terlalu panjang.')
});

export const loginSchema = z.object({
	username: z.string().trim().min(1, 'Nama pengguna wajib diisi.').max(80),
	password: z.string().min(1, 'Kata sandi wajib diisi.').max(200)
});

export function validationMessage(error: z.ZodError) {
	return error.issues[0]?.message ?? 'Data tidak valid.';
}
