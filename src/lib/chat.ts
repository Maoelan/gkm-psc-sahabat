export const STORY_LIMIT = 20_000;
export const MESSAGE_LIMIT = 2000;
export const FIELD_LIMITS = { incidentTime: 160, incidentLocation: 200, need: 300 };
export type ChatFields = { incidentTime: string; incidentLocation: string; need: string };
export type AnswerField = keyof ChatFields;

// Questions about the service stay in the transcript, not in the account of the incident.
export function isServiceQuestion(value: string) {
	return /^(?:apa(?:kah)?|siapa|bagaimana|gimana|kenapa|mengapa|bisa(?:kah)?|boleh(?:kah)?|adakah|berapa|kapan|di mana|ke mana)\b/i.test(value.trim()) ||
		/^(?:saya\s+)?(?:ingin|mau)\s+(?:tahu|bertanya)\b/i.test(value.trim()) ||
		/\b(?:menurut (?:anda|kamu)|minta (?:saran|nasihat)|apa pendapat)\b/i.test(value);
}

export function isUnknownAnswer(value: string) {
	return /\b(?:(?:belum|tidak|gak|nggak|ga)\s+(?:(?:begitu|terlalu)\s+)?(?:tahu|tau|ingat|yakin)|lupa|belum diketahui)\b/i.test(value);
}

export function reportContribution(value: string) {
	return value.trim().split(/(?<=[.!?])\s+|\n+/).filter((part) =>
		!isServiceQuestion(part) && !part.endsWith('?') && part !== 'Belum diketahui' &&
		!/^(?:ya|iya|oke|ok|baik|terima kasih|makasih|selesai|halo|hai)[.!\s]*$/i.test(part)
	).join('\n');
}

export function appendReportStory(story: string, message: string) {
	const contribution = reportContribution(message);
	const result = [story.trim(), contribution].filter(Boolean).join('\n\n');
	if (result.length > STORY_LIMIT) throw new Error(`Cerita maksimal ${STORY_LIMIT.toLocaleString('id-ID')} karakter. Periksa draf untuk merapikannya sebelum menambah cerita.`);
	return result;
}
