const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;
let nextCleanup = 0;

/**
 * Pembatas sederhana untuk satu proses demo. Pada deployment multi-instance,
 * ganti dengan penyimpanan bersama (misalnya Redis) dan catat audit.
 */
export function allowAttempt(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	if (now >= nextCleanup) {
		for (const [storedKey, stored] of buckets) if (stored.resetAt <= now) buckets.delete(storedKey);
		nextCleanup = now + 60_000;
	}
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		if (!bucket && buckets.size >= MAX_BUCKETS) return false;
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
