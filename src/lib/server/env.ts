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
	const baseUrl = env.PUBLIC_BASE_URL?.trim();
	if (baseUrl) return baseUrl.toLowerCase().startsWith('https://');
	return env.NODE_ENV === 'production';
}
