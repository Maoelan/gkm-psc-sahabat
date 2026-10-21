export type ServiceMode = 'operator' | 'ai' | 'unavailable';

export const SERVICE_HOURS_LABEL =
	'Senin–Kamis 08.00–14.00, Jumat 08.00–11.00, Sabtu 08.00–12.30 WITA';

export type ModeCopy = {
	label: string;
	assistantLabel: string;
	description: string;
};

export function modeCopy(mode: ServiceMode, aiEnabled: boolean): ModeCopy {
	if (mode === 'operator') {
		return {
			label: 'Layanan petugas',
			assistantLabel: 'Panduan LAPOR AMAN',
			description:
				'Laporan akan masuk ke meja petugas. Percakapan awal dipandu aplikasi untuk melengkapi draf; Anda dapat meminta bantuan petugas saat jam layanan, dan petugas meninjau setelah laporan dikirim.'
		};
	}
	if (mode === 'unavailable') {
		return {
			label: 'Layanan tidak tersedia',
			assistantLabel: 'Panduan mandiri',
			description:
				'Layanan petugas sedang tidak tersedia. Anda tetap dapat menyiapkan draf, tetapi pengiriman ke meja petugas belum dapat dilakukan saat ini.'
		};
	}
	return {
		label: aiEnabled ? 'Asisten AI' : 'Panduan terstruktur',
		assistantLabel: aiEnabled ? 'Asisten AI' : 'Panduan terstruktur',
		description: aiEnabled
			? 'Asisten AI menemani percakapan, menanggapi pertanyaan soal alur, dan menanyakan satu bagian pelengkap per giliran. AI tidak memberi diagnosis, nasihat hukum, atau keputusan. Pola nama, NIK, nomor, dan email yang jelas diredaksi sebelum cerita dikirim ke AI.'
			: 'Pertanyaan pelengkap memakai panduan terstruktur, bukan AI. Data identitas tidak dikirim ke layanan eksternal.'
	};
}
