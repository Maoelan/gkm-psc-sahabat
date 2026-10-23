import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRecapWorkbook } from './export';
import { createXlsx } from '../xlsx';
import { emptyVictimProfile, victimFields } from '../victim';
import type { RecapExportRow } from './reports';
vi.mock('../xlsx', async (original) => {
    const actual = await original<typeof import('../xlsx')>();
    return { ...actual, createXlsx: vi.fn(actual.createXlsx) };
});
afterEach(() => vi.clearAllMocks());
const row: RecapExportRow = {
    id: 'LA-TEST', receivedAt: '2026-10-23T01:00:00Z', victimName: '', nik: '0000000000000001', relation: 'Diri sendiri',
    profile: { ...emptyVictimProfile(), address: 'Alamat sintetis', violenceTypes: ['physical'] },
    story: 'Kronologi sintetis lengkap. '.repeat(120), incidentTime: 'Tadi siang', incidentLocation: 'Di rumah', need: 'Pendampingan',
    contactPreference: 'Aman dihubungi', contact: '0000-0000-0000, hanya siang', statusLabel: 'Perlu diperiksa', decisionLabel: 'Belum ada keputusan', reason: '', decidedAt: ''
};
describe('complete recap workbook', () => {
    it('exports every reporter field and chronology in one aligned table, preserving text NIK and blank optional values', () => {
        const result = buildRecapWorkbook([row]);
        expect(result.bytes.length).toBeGreaterThan(100);
        const [sheet] = vi.mocked(createXlsx).mock.calls[0][0];
        expect(sheet.rows[0]).toHaveLength(sheet.headers.length);
        expect(sheet.widths).toHaveLength(sheet.headers.length);
        const value = (header: string) => sheet.rows[0][sheet.headers.indexOf(header)];
        for (const field of victimFields) expect(sheet.headers).toContain(field.label);
        expect(value('NIK korban')).toBe('0000000000000001');
        expect(value('Tanggal lahir korban')).toBe('');
        expect(value('Alamat domisili korban')).toBe('Alamat sintetis');
        expect(value('Kronologi lengkap')).toBe(row.story);
        expect(value('Nomor dan keterangan kontak pelapor')).toBe(row.contact);
        expect(value('Waktu kejadian')).toBe(row.incidentTime);
        expect(value('Lokasi kejadian')).toBe(row.incidentLocation);
        expect(value('Izin dihubungi')).toBe('Aman dihubungi');
        expect(value('Waktu keputusan')).toBe('');
    });
    it('retains headers when there are no reports', () => {
        buildRecapWorkbook([]);
        const [sheet] = vi.mocked(createXlsx).mock.calls[0][0];
        expect(sheet.rows).toHaveLength(0);
        expect(sheet.headers).toContain('Kronologi lengkap');
    });
});
