const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Pembatas sederhana untuk satu proses demo. Pada deployment multi-instance,
 * ganti dengan penyimpanan bersama (misalnya Redis) dan catat audit.
 */
export function allowAttempt(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (bucket.count >= limit) return false;
	bucket.count += 1;
	return true;
}

export function resetAttempts(key: string) {
	buckets.delete(key);
}
