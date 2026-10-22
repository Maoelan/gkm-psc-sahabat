/**
 * Akses environment server. Nilai rahasia tidak boleh diimpor oleh kode klien.
 */
export const env: Record<string, string | undefined> =
	(
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env ?? {};

export function requiredEnv(name: string) {
	const value = env[name];
	if (!value) throw new Error(`${name} belum diatur.`);
	return value;
}

export function isAiEnabled() {
	return env.AI_ENABLED === 'true' && Boolean(env.NVIDIA_API_KEY);
}

/**
 * Cookie harus Secure saat publikasi HTTPS, tetapi tidak boleh memblokir
 * demo lokal yang dijalankan lewat HTTP.
 */
export function secureCookies() {
	if (env.VERCEL === '1') return true;
	const baseUrl = env.PUBLIC_BASE_URL?.trim();
	if (baseUrl) {
		const url = new URL(baseUrl);
		if (url.protocol === 'https:') return true;
		if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
		throw new Error('PUBLIC_BASE_URL wajib HTTPS kecuali untuk localhost.');
	}
	return env.NODE_ENV === 'production';
}
