import { createXlsx, XLSX_MIME_TYPE, type XlsxSheet } from '../xlsx';
import { formatReportDate } from '../reports';
import type { RecapExportRow } from './reports';

export function buildRecapWorkbook(rows: RecapExportRow[], generatedAt = new Date()) {
	const stamp = new Intl.DateTimeFormat('id-ID', {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'Asia/Makassar'
	}).format(generatedAt);
	const fileDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' })
		.format(generatedAt)
		.replaceAll('-', '');

	const sheets: XlsxSheet[] = [
		{
			name: 'Rekap',
			title: 'REKAP LAPOR AMAN',
			note: `Dibuat server pada ${stamp} WITA. Sheet ini tidak memuat NIK. Jangan dibagikan kepada pihak yang tidak berwenang.`,
			headers: [
				'Kode laporan',
				'Tanggal masuk',
				'Nama korban',
				'Hubungan',
				'Kebutuhan',
				'Status',
				'Keputusan',
				'Alasan keputusan'
			],
			rows: rows.map((row) => [
				row.id,
				formatReportDate(row.receivedAt),
				row.victimName,
				row.relation,
				row.need,
				row.statusLabel,
				row.decisionLabel,
				row.reason
			]),
			widths: [20, 22, 20, 22, 28, 20, 24, 38]
		},
		{
			name: 'Identitas',
			title: 'IDENTITAS KORBAN — AKSES BIDAN/PIC',
			note: 'Berisi NIK. Hanya untuk akun bidan/PIC. Jangan dibagikan ke meja petugas umum.',
			headers: ['Kode laporan', 'Nama korban', 'NIK', 'Status', 'Keputusan'],
			rows: rows.map((row) => [
				row.id,
				row.victimName,
				row.nik || 'Tidak diisi',
				row.statusLabel,
				row.decisionLabel
			]),
			widths: [20, 24, 22, 20, 24]
		}
	];

	return {
		filename: `rekap-lapor-aman-${fileDate}.xlsx`,
		bytes: createXlsx(sheets),
		contentType: XLSX_MIME_TYPE
	};
}
