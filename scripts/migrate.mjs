import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');

const client = new pg.Client({
	connectionString: databaseUrl,
	ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

const dbDirectory = fileURLToPath(new URL('../db/', import.meta.url));

await client.connect();
try {
	await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version text PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`);

	const files = (await readdir(dbDirectory))
		.filter((file) => /^\d+_.+\.sql$/.test(file))
		.sort();

	for (const file of files) {
		const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
		if (applied.rowCount) continue;

		const sql = await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8');
		await client.query('BEGIN');
		try {
			await client.query(sql);
			await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
			await client.query('COMMIT');
			console.log(`Migrasi diterapkan: ${file}`);
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		}
	}
	console.log('Migrasi database selesai.');
} finally {
	await client.end();
}
