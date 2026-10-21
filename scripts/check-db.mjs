import { createDecipheriv } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');
const reportKey = Buffer.from(process.env.REPORT_DATA_KEY ?? '', 'base64');
const nikKey = Buffer.from(process.env.NIK_DATA_KEY ?? '', 'base64');
if (reportKey.length !== 32 || nikKey.length !== 32) {
	throw new Error('Kunci enkripsi belum valid.');
}

function decrypt(enc, iv, tag, purpose) {
	const key = purpose === 'nik' ? nikKey : reportKey;
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAAD(Buffer.from(purpose, 'utf8'));
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const client = new pg.Client({
	connectionString: databaseUrl,
	ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

const checks = [];
function check(name, passed, detail = '') {
	checks.push({ name, passed, detail });
}

await client.connect();
try {
	const identity = await client.query(
		`SELECT current_user AS app_user, current_database() AS database,
		        pg_get_userbyid(datdba) AS owner
		 FROM pg_database WHERE datname = current_database()`
	);
	const row = identity.rows[0];
	check('Aplikasi memakai peran maoelana', row.app_user === 'maoelana', row.app_user);
	check('Database lokal bernama lapor_aman', row.database === 'lapor_aman', row.database);
	check('Database dimiliki maoelana', row.owner === 'maoelana', row.owner);

	const migrations = await client.query('SELECT version FROM schema_migrations ORDER BY version');
	check('Migrasi tercatat', migrations.rowCount > 0, migrations.rows.map((item) => item.version).join(', '));

	const tables = await client.query(
		`SELECT count(*)::int AS count FROM information_schema.tables
		 WHERE table_schema = 'public'`
	);
	check('Tabel aplikasi tersedia', Number(tables.rows[0].count) >= 18, `${tables.rows[0].count} tabel`);

	const handoffSchema = await client.query(
		`SELECT count(*)::int AS columns
		 FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'chat_handoffs'`
	);
	check(
		'Skema handoff petugas tersedia',
		Number(handoffSchema.rows[0].columns) >= 9,
		`${handoffSchema.rows[0].columns} kolom`
	);

	const staff = await client.query(
		`SELECT su.username, array_agg(sr.role ORDER BY sr.role) AS roles
		 FROM staff_users su LEFT JOIN staff_roles sr ON sr.staff_id = su.id
		 GROUP BY su.username ORDER BY su.username`
	);
	check('Tiga akun staff lokal tersedia', staff.rowCount >= 3, `${staff.rowCount} akun`);
	check(
		'Akun petugas memiliki peran petugas',
		staff.rows.some((item) => item.username === 'petugas' && item.roles?.includes('petugas'))
	);
	check(
		'Akun bidan memiliki peran bidan_pic',
		staff.rows.some((item) => item.username === 'bidan' && item.roles?.includes('bidan_pic'))
	);
	check(
		'Akun admin memiliki peran admin',
		staff.rows.some((item) => item.username === 'admin' && item.roles?.includes('admin'))
	);
	check(
		'Akun petugas memiliki akses admin',
		staff.rows.some((item) => item.username === 'petugas' && item.roles?.includes('admin'))
	);
	check(
		'Akun bidan memiliki akses admin',
		staff.rows.some((item) => item.username === 'bidan' && item.roles?.includes('admin'))
	);

	const schedules = await client.query('SELECT count(*)::int AS count FROM service_schedules');
	check('Jadwal layanan tersedia', Number(schedules.rows[0].count) >= 6, `${schedules.rows[0].count} hari`);

	const reports = await client.query(
		`SELECT count(*)::int AS count,
		        count(*) FILTER (WHERE status = 'decision_recorded')::int AS decided
		 FROM reports`
	);
	check('Tiga laporan latihan tersedia', Number(reports.rows[0].count) >= 3, `${reports.rows[0].count} laporan`);
	check('Histori keputusan tersedia', Number(reports.rows[0].decided) >= 1, `${reports.rows[0].decided} keputusan`);

	const transcripts = await client.query(
		`SELECT count(*)::int AS count,
		        count(DISTINCT session_id)::int AS sessions,
		        count(*) FILTER (WHERE source IS NULL)::int AS missing_source
		 FROM chat_messages`
	);
	check(
		'Riwayat percakapan sample tersedia',
		Number(transcripts.rows[0].count) >= 3 &&
			Number(transcripts.rows[0].missing_source) === 0,
		`${transcripts.rows[0].count} pesan, ${transcripts.rows[0].sessions} sesi`
	);

	const messageConstraints = await client.query(
		`SELECT pg_get_constraintdef(c.oid) AS definition
		 FROM pg_constraint c
		 JOIN pg_class t ON t.oid = c.conrelid
		 WHERE t.relname = 'chat_messages' AND c.contype = 'c'`
	);
	const definitions = messageConstraints.rows.map((item) => item.definition).join(' ');
	check(
		'Pesan staff dan handoff diizinkan',
		definitions.includes("'staff'") && definitions.includes("'handoff'")
	);

	const sample = await client.query(
		`SELECT r.reference_code, r.content_enc, r.content_iv, r.content_tag,
		        v.name_enc, v.name_iv, v.name_tag, v.nik_enc, v.nik_iv, v.nik_tag
		 FROM reports r JOIN victim_details v ON v.id = r.victim_id
		 ORDER BY r.submitted_at ASC LIMIT 1`
	);
	if (sample.rows[0]) {
		const report = sample.rows[0];
		try {
			const content = decrypt(
				report.content_enc,
				report.content_iv,
				report.content_tag,
				'report_content'
			);
			const name = decrypt(report.name_enc, report.name_iv, report.name_tag, 'victim_name');
			const nik = report.nik_enc
				? decrypt(report.nik_enc, report.nik_iv, report.nik_tag, 'nik')
				: '';
			const parsed = JSON.parse(content);
			check(
				'Sample laporan dapat didekripsi',
				Boolean(parsed.story) && Boolean(name),
				`${parsed.story.length} karakter cerita`
			);
			check('NIK sample memakai kunci NIK terpisah', nik === '' || /^\d{16}$/.test(nik));
		} catch {
			check('Sample laporan dapat didekripsi', false, 'dekripsi gagal');
		}
	}

	const plaintextColumns = await client.query(
		`SELECT table_name, column_name FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND column_name IN ('story', 'nik', 'victim_name', 'contact')`
	);
	check(
		'Tidak ada kolom cerita/NIK/nama/kontak plaintext',
		plaintextColumns.rowCount === 0,
		plaintextColumns.rows.map((item) => `${item.table_name}.${item.column_name}`).join(', ')
	);
} finally {
	await client.end();
}

let failed = 0;
for (const item of checks) {
	console.log(`${item.passed ? 'OK' : 'GAGAL'}  ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
	if (!item.passed) failed += 1;
}
if (failed) {
	console.error(`${failed} pemeriksaan gagal.`);
	process.exitCode = 1;
} else {
	console.log('Semua pemeriksaan database lokal lulus.');
}
