import { createXlsx, XLSX_MIME_TYPE, type XlsxSheet } from "../xlsx";
import { formatReportDate } from "../reports";
import type { RecapExportRow } from "./reports";
import { victimFields } from "../victim";
import { violenceTypes } from "../education";

export function buildRecapWorkbook(
  rows: RecapExportRow[],
  generatedAt = new Date(),
) {
  const stamp = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  }).format(generatedAt);
  const fileDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
  })
    .format(generatedAt)
    .replaceAll("-", "");

  const sheets: XlsxSheet[] = [{
    name: "Rekap",
    title: "REKAP LENGKAP LAPOR AMAN - PSC",
    note: `Dibuat server pada ${stamp} WITA. Berisi identitas, kontak, dan kronologi; hanya untuk admin berwenang. Kolom opsional yang tidak diisi dibiarkan kosong.`,
    headers: [
      "Kode laporan", "Tanggal masuk", "Nama korban", "NIK korban", "Hubungan pelapor dengan korban",
      ...victimFields.map(field => field.label),
      "Dugaan jenis kekerasan", "Kronologi lengkap", "Waktu kejadian", "Lokasi kejadian",
      "Bantuan yang diharapkan", "Izin dihubungi", "Nomor dan keterangan kontak pelapor",
      "Status laporan", "Keputusan", "Alasan keputusan", "Waktu keputusan"
    ],
    rows: rows.map(row => [
      row.id, formatReportDate(row.receivedAt), row.victimName === "Nama belum diisi" ? "" : row.victimName,
      row.nik || "", row.relation,
      ...victimFields.map(field => row.profile?.[field.key] || ""),
      violenceTypes.filter(type => row.profile?.violenceTypes.includes(type.id)).map(type => type.name).join(", "),
      row.story, row.incidentTime, row.incidentLocation, row.need, row.contactPreference, row.contact || "",
      row.statusLabel, row.decisionLabel, row.reason, row.decidedAt ? formatReportDate(row.decidedAt) : ""
    ]),
    widths: [20, 22, 24, 22, 28, ...victimFields.map(() => 28), 32, 42, 24, 28, 30, 24, 36, 22, 26, 38, 24]
  }];

  return {
    filename: `rekap-lapor-aman-${fileDate}.xlsx`,
    bytes: createXlsx(sheets),
    contentType: XLSX_MIME_TYPE,
  };
}
