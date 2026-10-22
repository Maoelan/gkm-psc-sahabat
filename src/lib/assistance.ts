import type { ChatFields } from './chat';

export const assistanceTopics = [
	{ key: 'story', label: 'Cerita kejadian' },
	{ key: 'incidentTime', label: 'Perkiraan waktu' },
	{ key: 'incidentLocation', label: 'Lokasi umum' },
	{ key: 'need', label: 'Bantuan yang diharapkan' }
] as const;

export type AssistanceField = (typeof assistanceTopics)[number]['key'];
export type CollectedInformation = {
	status: 'found' | 'unknown' | 'missing';
	quote: string;
	messageId: string | null;
};
export type StaffAssistance = {
	fields: Record<AssistanceField, CollectedInformation>;
	suggestion: { field: AssistanceField; question: string } | null;
	source: 'nvidia' | 'fallback';
	updatedAt: string;
};

export function collectedChatFields(assistance: StaffAssistance): Partial<ChatFields> {
	const fields: Partial<ChatFields> = {};
	for (const key of ['incidentTime', 'incidentLocation', 'need'] as const) {
		if (assistance.fields[key].status === 'found') fields[key] = assistance.fields[key].quote;
		else if (assistance.fields[key].status === 'unknown') fields[key] = 'Belum diketahui';
	}
	return fields;
}
