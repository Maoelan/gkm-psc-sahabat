import { env } from './env';
import pg from 'pg';

let pool: pg.Pool | undefined;

function getPool() {
	if (!pool) {
		const databaseUrl = env.DATABASE_URL;
		if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');
		pool = new pg.Pool({
			connectionString: databaseUrl,
			ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
			max: 10,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5_000
		});
		pool.on('error', () => console.error('Koneksi PostgreSQL terputus tanpa terduga.'));
	}
	return pool;
}

export const db = new Proxy({} as pg.Pool, {
	get(_target, property) {
		const instance = getPool();
		const value = Reflect.get(instance, property);
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});

export async function transaction<T>(run: (client: pg.PoolClient) => Promise<T>) {
	const client = await db.connect();
	try {
		await client.query('BEGIN');
		const result = await run(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}
