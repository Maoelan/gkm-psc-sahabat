import { createCipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const reportKey = Buffer.from(process.env.REPORT_DATA_KEY ?? '', 'base64');
const nikKey = Buffer.from(process.env.NIK_DATA_KEY ?? '', 'base64');
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');
if (reportKey.length !== 32) throw new Error('REPORT_DATA_KEY harus 32 byte Base64.');
if (nikKey.length !== 32) throw new Error('NIK_DATA_KEY harus 32 byte Base64.');

const reset = process.argv.includes('--reset');
const dbName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (reset && process.env.NODE_ENV === 'production') {
	throw new Error('Reset data ditolak saat NODE_ENV=production.');
}
if (reset && dbName !== 'lapor_aman') {
	throw new Error('Reset data hanya diizinkan untuk database lapor_aman.');
}

function hashPassword(password) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
	return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function encrypt(value, purpose) {
	const key = purpose === 'nik' ? nikKey : reportKey;
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(purpose, 'utf8'));
	const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
	const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return { enc, iv, tag: cipher.getAuthTag() };
}

function hashSecret(value) {
	return createHash('sha256').update(value).digest('hex');
}

function token(bytes = 32) {
	return randomBytes(bytes).toString('base64url');
}

const client = new pg.Client({
	connectionString: databaseUrl,
	ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

await client.connect();
try {
	await client.query('BEGIN');
	if (reset) {
		await client.query(`TRUNCATE TABLE
			audit_events, notification_outbox, privacy_acknowledgements, report_decisions,
			report_reviews, report_assignments, reports, reporter_details, victim_details,
			report_drafts, chat_messages, chat_handoffs, chat_sessions, staff_sessions, staff_roles,
			staff_users, schedule_exceptions, service_schedules
			RESTART IDENTITY CASCADE`);
	}

	const petugasPassword = process.env.DEMO_STAFF_PETUGAS_PASSWORD;
	const bidanPassword = process.env.DEMO_STAFF_BIDAN_PASSWORD;
	if (!petugasPassword || !bidanPassword) {
		throw new Error('Kata sandi akun staff belum diatur di .env.');
	}

	const petugasId = randomUUID();
	const bidanId = randomUUID();
	await client.query(
		`INSERT INTO staff_users (id, username, display_name, password_hash)
		 VALUES ($1, 'petugas', 'Petugas', $2), ($3, 'bidan', 'Bidan/PIC', $4)
		 ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name,
		   password_hash = EXCLUDED.password_hash, active = true`,
		[petugasId, hashPassword(petugasPassword), bidanId, hashPassword(bidanPassword)]
	);
	const staff = await client.query('SELECT id, username FROM staff_users WHERE username IN ($1, $2)', [
		'petugas',
		'bidan'
	]);
	const petugas = staff.rows.find((row) => row.username === 'petugas')?.id;
	const bidan = staff.rows.find((row) => row.username === 'bidan')?.id;
	if (!petugas || !bidan) throw new Error('Akun staff gagal dibuat.');

	await client.query(
		`INSERT INTO staff_roles (staff_id, role, scope) VALUES
		 ($1, 'petugas', 'assigned'), ($2, 'bidan_pic', 'all')
		 ON CONFLICT (staff_id, role) DO UPDATE SET scope = EXCLUDED.scope`,
		[petugas, bidan]
	);

	const scheduleCount = await client.query('SELECT count(*)::int AS count FROM service_schedules');
	if (Number(scheduleCount.rows[0].count) === 0) {
		await client.query(
			`INSERT INTO service_schedules (id, weekday, opens_at, closes_at, timezone, effective_from)
			 VALUES
			 ($1, 1, '08:00', '14:00', 'Asia/Makassar', '2026-01-01'),
			 ($2, 2, '08:00', '14:00', 'Asia/Makassar', '2026-01-01'),
			 ($3, 3, '08:00', '14:00', 'Asia/Makassar', '2026-01-01'),
			 ($4, 4, '08:00', '14:00', 'Asia/Makassar', '2026-01-01'),
			 ($5, 5, '08:00', '11:00', 'Asia/Makassar', '2026-01-01'),
			 ($6, 6, '08:00', '12:30', 'Asia/Makassar', '2026-01-01')`,
			[randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
		);
	}

	const reportCount = await client.query('SELECT count(*)::int AS count FROM reports');
	if (Number(reportCount.rows[0].count) > 0) {
		if (!reset) {
			await client.query('COMMIT');
			console.log('Data seed sudah ada. Gunakan npm run db:reset untuk mengulang data latihan.');
			await client.end();
			process.exit(0);
		}
	}

	const seeds = [
		{
			code: 'LA-2026-001',
			victimName: 'Ayu',
			nik: '0000000000000001',
			relation: 'Diri sendiri',
			story:
				'Saya mengalami kejadian kekerasan di rumah kemarin sore. Saya ingin mendapat pendampingan dan informasi langkah berikutnya.',
			time: 'Kemarin sore',
			location: 'Rumah',
			need: 'Meminta informasi pendampingan',
			safeContact: 'no',
			contactDetails: '',
			mode: 'ai',
			status: 'submitted',
			minutesAgo: 10,
			decision: null,
			reason: ''
		},
		{
			code: 'LA-2026-002',
			victimName: 'Nadia',
			nik: '0000000000000002',
			relation: 'Keluarga atau pendamping',
			story:
				'Saya melapor untuk anggota keluarga yang mengalami kejadian di sekolah. Saya belum mengetahui waktu kejadiannya.',
			time: 'Belum diketahui',
			location: 'Sekolah',
			need: 'Belum diketahui',
			safeContact: 'yes',
			contactDetails: 'WhatsApp pada pukul 10.00-12.00. Jangan sebut nama saya.',
			mode: 'operator',
			status: 'under_review',
			minutesAgo: 35,
			decision: null,
			reason: ''
		},
		{
			code: 'LA-2026-003',
			victimName: 'Sari',
			nik: '',
			relation: 'Pihak lain yang mengetahui kejadian',
			story:
				'Saya mengetahui kejadian di tempat kerja minggu lalu dan ingin petugas meninjau kebutuhan pendampingan.',
			time: 'Minggu lalu',
			location: 'Tempat kerja',
			need: 'Meminta petugas meninjau kebutuhan',
			safeContact: 'no',
			contactDetails: '',
			mode: 'ai',
			status: 'decision_recorded',
			minutesAgo: 24 * 60,
			decision: 'follow_up_required',
			reason: 'Laporan memerlukan pemeriksaan lanjutan oleh petugas.'
		}
	];

	for (const seed of seeds) {
		const sessionId = randomUUID();
		const draftId = randomUUID();
		const victimId = randomUUID();
		const reporterId = randomUUID();
		const reportId = randomUUID();
		const submittedAt = new Date(Date.now() - seed.minutesAgo * 60_000);
		const secretHash = hashSecret(token(32));
		const draftContent = {
			victimName: seed.victimName,
			victimNik: seed.nik,
			relation: seed.relation,
			story: seed.story,
			incidentTime: seed.time,
			incidentLocation: seed.location,
			need: seed.need,
			safeContact: seed.safeContact,
			contactDetails: seed.contactDetails
		};
		const reportContent = {
			story: seed.story,
			incidentTime: seed.time,
			incidentLocation: seed.location,
			need: seed.need,
			contactPreference: seed.safeContact
		};
		const draftEnc = encrypt(draftContent, 'draft_content');
		const reportEnc = encrypt(reportContent, 'report_content');
		const nameEnc = encrypt(seed.victimName, 'victim_name');
		const nikEnc = seed.nik ? encrypt(seed.nik, 'nik') : null;
		const relationEnc = encrypt(seed.relation, 'relationship');
		const contactEnc =
			seed.safeContact === 'yes' && seed.contactDetails
				? encrypt(seed.contactDetails, 'contact_details')
				: null;

		await client.query(
			`INSERT INTO chat_sessions (id, session_secret_hash, mode, status, csrf_token, expires_at, created_at)
			 VALUES ($1, $2, $3, 'ended', $4, $5, $6)`,
			[sessionId, secretHash, seed.mode, token(24), new Date(Date.now() + 30 * 86400000), submittedAt]
		);

		const assistantSource = seed.mode === 'ai' ? 'ai' : 'fallback';
		const assistantSender = seed.mode === 'ai' ? 'assistant' : 'service';
		const transcript = [
			{ senderType: 'user', source: 'user', body: seed.story },
			...(seed.time === 'Belum diketahui'
				? [
						{ senderType: assistantSender, source: assistantSource, body: 'Kapan kira-kira kejadian itu terjadi? Perkiraan waktu sudah cukup.' },
						{ senderType: 'user', source: 'user', body: 'Belum diketahui' }
					]
				: []),
			...(seed.location === 'Belum diketahui'
				? [
						{ senderType: assistantSender, source: assistantSource, body: 'Di mana kira-kira kejadian itu berlangsung? Lokasi umum sudah cukup.' },
						{ senderType: 'user', source: 'user', body: 'Belum diketahui' }
					]
				: []),
			{
				senderType: assistantSender,
				source: assistantSource,
				body: 'Bantuan atau dukungan apa yang Anda harapkan setelah kejadian ini?'
			},
			{ senderType: 'user', source: 'user', body: seed.need },
			{
				senderType: assistantSender,
				source: assistantSource,
				body: 'Bagian utama sudah saya catat. Anda bisa menambah cerita kalau ada yang belum tersampaikan, atau menekan Selesai untuk memeriksa draf.'
			}
		];
		for (const [index, message] of transcript.entries()) {
			const bodyEnc = encrypt(message.body, 'chat_message');
			await client.query(
				`INSERT INTO chat_messages
				 (id, session_id, sender_type, source, body_enc, body_iv, body_tag, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					randomUUID(),
					sessionId,
					message.senderType,
					message.source,
					bodyEnc.enc,
					bodyEnc.iv,
					bodyEnc.tag,
					new Date(submittedAt.getTime() - (transcript.length - index) * 60_000)
				]
			);
		}

		await client.query(
			`INSERT INTO report_drafts
			 (id, session_id, version, content_enc, content_iv, content_tag, status, expires_at, created_at, updated_at)
			 VALUES ($1, $2, 1, $3, $4, $5, 'confirmed', $6, $7, $7)`,
			[
				draftId,
				sessionId,
				draftEnc.enc,
				draftEnc.iv,
				draftEnc.tag,
				new Date(Date.now() + 30 * 86400000),
				submittedAt
			]
		);
		await client.query(
			`INSERT INTO victim_details
			 (id, name_enc, name_iv, name_tag, nik_enc, nik_iv, nik_tag, nik_last4, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				victimId,
				nameEnc.enc,
				nameEnc.iv,
				nameEnc.tag,
				nikEnc?.enc ?? null,
				nikEnc?.iv ?? null,
				nikEnc?.tag ?? null,
				seed.nik ? seed.nik.slice(-4) : null,
				submittedAt
			]
		);
		await client.query(
			`INSERT INTO reporter_details
			 (id, relationship_enc, relationship_iv, relationship_tag, safe_contact_allowed,
			  contact_enc, contact_iv, contact_tag, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				reporterId,
				relationEnc.enc,
				relationEnc.iv,
				relationEnc.tag,
				seed.safeContact === 'yes',
				contactEnc?.enc ?? null,
				contactEnc?.iv ?? null,
				contactEnc?.tag ?? null,
				submittedAt
			]
		);
		await client.query(
			`INSERT INTO reports
			 (id, reference_code, victim_id, reporter_id, source_session_id, draft_id,
			  confirmed_draft_version, content_enc, content_iv, content_tag, status,
			  idempotency_key, submitted_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, $12, $12)`,
			[
				reportId,
				seed.code,
				victimId,
				reporterId,
				sessionId,
				draftId,
				reportEnc.enc,
				reportEnc.iv,
				reportEnc.tag,
				seed.status,
				randomUUID(),
				submittedAt
			]
		);
		await client.query(
			`INSERT INTO report_assignments (id, report_id, staff_id, assigned_at)
			 VALUES ($1, $2, $3, $4)`,
			[randomUUID(), reportId, petugas, submittedAt]
		);
		await client.query(
			`INSERT INTO privacy_acknowledgements
			 (id, session_id, report_id, notice_version, purpose, acknowledged_at)
			 VALUES ($1, $2, $3, '2026-10-20', $4, $5)`,
			[randomUUID(), sessionId, reportId, 'Menyiapkan dan memeriksa pengaduan', submittedAt]
		);
		await client.query(
			`INSERT INTO notification_outbox
			 (id, report_id, recipient_staff_id, event_type, payload, created_at, updated_at)
			 VALUES ($1, $2, $3, 'report.submitted', $4::jsonb, $5, $5)`,
			[
				randomUUID(),
				reportId,
				petugas,
				JSON.stringify({ purpose: 'report_submitted' }),
				submittedAt
			]
		);
		if (seed.status === 'decision_recorded' && seed.decision) {
			const reasonEnc = encrypt(seed.reason, 'decision_reason');
			await client.query(
				`INSERT INTO report_decisions
				 (id, report_id, decision, reason_enc, reason_iv, reason_tag, decided_by, decided_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					randomUUID(),
					reportId,
					seed.decision,
					reasonEnc.enc,
					reasonEnc.iv,
					reasonEnc.tag,
					petugas,
					new Date(submittedAt.getTime() + 50 * 60_000)
				]
			);
		}
	}
	await client.query(
		`INSERT INTO audit_events (id, actor_type, action, object_type, metadata_minimal)
		 VALUES ($1, 'system', 'seed.applied', 'database', '{"kind":"seed"}')`,
		[randomUUID()]
	);
	await client.query('COMMIT');
	console.log('Data awal disiapkan: 2 akun staff, jadwal layanan, dan 3 laporan.');
	console.log('Akun: petugas dan bidan. Kata sandi dibaca dari .env.');
} catch (error) {
	await client.query('ROLLBACK');
	console.error('Seed gagal:', error instanceof Error ? error.message : 'kesalahan tidak diketahui');
	process.exitCode = 1;
} finally {
	await client.end();
}
