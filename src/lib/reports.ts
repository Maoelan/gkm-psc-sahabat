export type ReportStatus = 'submitted' | 'under_review' | 'decision_recorded';
export type Decision = 'follow_up_required' | 'follow_up_not_required';
export type ServiceMode = 'operator' | 'ai' | 'unavailable';

export type TranscriptSender = 'user' | 'assistant' | 'service' | 'staff';
export type TranscriptSource = 'user' | 'ai' | 'fallback' | 'guide' | 'staff' | 'handoff';
export type TranscriptMessage = {
	id: string;
	sender: TranscriptSender;
	source: TranscriptSource;
	body: string;
	createdAt: string;
};

export type OfficerReport = {
	id: string;
	victimName: string;
	relation: string;
	received: string;
	receivedAt: string;
	status: ReportStatus;
	statusLabel: string;
	mode: ServiceMode;
	modeLabel: string;
	need: string;
	story: string;
	time: string;
	location: string;
	contact: string;
	decision?: Decision;
	reason?: string;
	decidedAt?: string;
};

export type RecapReport = {
	id: string;
	victimName: string;
	nikLast4: string | null;
	relation: string;
	need: string;
	time: string;
	location: string;
	contact: string;
	receivedAt: string;
	status: ReportStatus;
	statusLabel: string;
	decision?: Decision;
	reason?: string;
	decidedAt?: string;
};

export type NikDirectoryEntry = {
	id: string;
	victimName: string;
	nik: string;
	receivedAt: string;
	status: ReportStatus;
	statusLabel: string;
};

export function statusLabel(status: ReportStatus) {
	if (status === 'under_review') return 'Sedang diperiksa';
	if (status === 'decision_recorded') return 'Keputusan tercatat';
	return 'Perlu diperiksa';
}

export function decisionLabel(decision?: Decision | null) {
	if (decision === 'follow_up_required') return 'Perlu tindak lanjut';
	if (decision === 'follow_up_not_required') return 'Tidak perlu tindak lanjut';
	return 'Belum ada keputusan';
}

export function maskNik(value: string | null | undefined) {
	if (!value) return 'Tidak diisi';
	const last4 = value.length > 4 ? value.slice(-4) : value;
	return `NIK berakhir ${last4}`;
}

/**
 * Masking untuk teks yang ditampilkan ke petugas umum. Nama tetap terlihat
 * karena diperlukan untuk mengenali laporan, tetapi NIK dan kontak disamarkan.
 */
export function maskSensitiveText(value: string) {
	return value
		.replace(/(?<!\d)(?:\d[\s.\-]?){15}\d(?![\s.\-]?\d)/g, '[NIK disamarkan]')
		.replace(
			/(?<!\w)(?:\+62|62|0)[\s-]*8[\d\s-]{7,14}\d(?!\w)/g,
			'[nomor disamarkan]'
		)
		.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[email disamarkan]');
}

export function formatNik(nik: string) {
	if (!nik) return 'Tidak diisi';
	return nik.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function normalizeNik(value: string) {
	return value.replace(/\D/g, '').slice(0, 16);
}

export function isValidNik(value: string) {
	return value.length === 0 || value.length === 16;
}

export function formatReportDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
	return new Intl.DateTimeFormat('id-ID', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Makassar'
	}).format(date);
}

export function formatReceivedAt(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
	return new Intl.DateTimeFormat('id-ID', {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'Asia/Makassar'
	}).format(date);
}
