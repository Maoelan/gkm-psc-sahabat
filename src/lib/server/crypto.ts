import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	scryptSync,
	timingSafeEqual
} from 'node:crypto';
import { env } from './env';

export type EncryptionPurpose =
	| 'chat_message'
	| 'draft_content'
	| 'report_content'
	| 'victim_name'
	| 'nik'
	| 'relationship'
	| 'contact_details'
	| 'review_notes'
	| 'decision_reason';

export type EncryptedValue = { encrypted: Buffer; iv: Buffer; tag: Buffer };

function encryptionKey(purpose: EncryptionPurpose) {
	const variable = purpose === 'nik' ? 'NIK_DATA_KEY' : 'REPORT_DATA_KEY';
	const key = Buffer.from(env[variable] ?? '', 'base64');
	if (key.length !== 32) throw new Error(`${variable} harus berupa 32 byte dalam Base64.`);
	return key;
}

export function encrypt(value: unknown, purpose: EncryptionPurpose = 'report_content'): EncryptedValue {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(purpose), iv);
	cipher.setAAD(Buffer.from(purpose, 'utf8'));
	const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return { encrypted, iv, tag: cipher.getAuthTag() };
}

export function decrypt(
	encrypted: Buffer,
	iv: Buffer,
	tag: Buffer,
	purpose: EncryptionPurpose = 'report_content'
) {
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(purpose), iv);
	decipher.setAAD(Buffer.from(purpose, 'utf8'));
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function decryptJson<T>(
	encrypted: Buffer,
	iv: Buffer,
	tag: Buffer,
	purpose: EncryptionPurpose = 'report_content'
) {
	return JSON.parse(decrypt(encrypted, iv, tag, purpose)) as T;
}

export function hashSecret(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
	return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string) {
	try {
		const [algorithm, n, r, p, saltValue, hashValue] = stored.split('$');
		if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false;
		const salt = Buffer.from(saltValue, 'base64');
		const expected = Buffer.from(hashValue, 'base64');
		const actual = scryptSync(password, salt, expected.length, {
			N: Number(n),
			r: Number(r),
			p: Number(p)
		});
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
}

export function randomToken(bytes = 32) {
	return randomBytes(bytes).toString('base64url');
}
