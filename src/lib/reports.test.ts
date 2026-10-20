import { describe, expect, it } from 'vitest';
import { maskSensitiveText } from './reports';

describe('maskSensitiveText', () => {
	it('menyamarkan NIK, nomor, dan email pada teks untuk petugas', () => {
		const result = maskSensitiveText(
			'NIK 0000000000000001, telepon 0812-3456-7890, email ayu@example.test.'
		);
		expect(result).not.toContain('0000000000000001');
		expect(result).not.toContain('0812-3456-7890');
		expect(result).not.toContain('ayu@example.test');
		expect(result).toContain('[NIK disamarkan]');
		expect(result).toContain('[nomor disamarkan]');
		expect(result).toContain('[email disamarkan]');
	});

	it('membiarkan teks tanpa pola identitas', () => {
		const text = 'Kejadian berlangsung di rumah pada sore hari.';
		expect(maskSensitiveText(text)).toBe(text);
	});
});
