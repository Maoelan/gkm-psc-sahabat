import type { TranscriptMessage } from './reports';

export type HandoffStatus = 'waiting' | 'active' | 'closed' | 'cancelled';
export type HandoffCloseReason = 'staff_closed' | 'reporter_cancelled' | 'session_ended';

export type ReporterHandoff = {
	id: string;
	status: HandoffStatus;
	requestedAt: string;
	claimedAt: string | null;
	closedAt: string | null;
	closeReason: HandoffCloseReason | null;
};

export type StaffHandoff = ReporterHandoff & {
	claimedByMe: boolean;
	claimedByName: string | null;
};

export type HandoffThreadMessage = TranscriptMessage;

export type HandoffQueueItem = {
	id: string;
	status: 'waiting' | 'active';
	requestedAt: string;
	claimedAt: string | null;
	claimedByMe: boolean;
	claimedByName: string | null;
	messageCount: number;
	lastMessageAt: string | null;
};

export type HandoffMessageResponse = {
	handoff: ReporterHandoff | null;
	messages: HandoffThreadMessage[];
	latestMessageId: string | null;
};

export type ReporterHandoffResponse = {
	handoff: ReporterHandoff;
	message: HandoffThreadMessage | null;
	latestMessageId: string | null;
};

export function isHandoffOpen(status: HandoffStatus | null | undefined) {
	return status === 'waiting' || status === 'active';
}

export function handoffStatusLabel(status: HandoffStatus) {
	if (status === 'waiting') return 'Menunggu petugas';
	if (status === 'active') return 'Petugas bergabung';
	if (status === 'cancelled') return 'Bantuan dibatalkan';
	return 'Bantuan selesai';
}

export function handoffStatusCopy(status: HandoffStatus) {
	if (status === 'waiting') {
		return 'Permintaan Anda sudah masuk. Anda tetap bisa menulis; pesan akan dibaca petugas saat bergabung.';
	}
	if (status === 'active') {
		return 'Petugas sudah bergabung. AI dijeda sampai percakapan dengan petugas selesai.';
	}
	if (status === 'cancelled') {
		return 'Bantuan petugas diakhiri. Anda bisa melanjutkan percakapan atau meminta bantuan lagi.';
	}
	return 'Percakapan dengan petugas sudah ditutup. Anda bisa melanjutkan draf atau meminta bantuan lagi.';
}
