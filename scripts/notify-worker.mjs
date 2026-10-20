import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');
const provider = (process.env.WHATSAPP_PROVIDER || 'outbox').toLowerCase();
const recipient =
	(process.env.WHATSAPP_RECIPIENT_NUMBER || process.env.PIC_WHATSAPP_NUMBER || '').trim();
const genericMessage =
	'Laporan baru sudah masuk ke LAPOR AMAN. Buka aplikasi untuk meninjau. Pesan ini tidak memuat nama, cerita, NIK, nomor, atau lampiran.';

const client = new pg.Client({
	connectionString: databaseUrl,
	ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

function backoffMinutes(attempts) {
	return Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)));
}

async function sendMeta() {
	const token = process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
	const phoneId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_SENDER;
	if (!token || !phoneId || !recipient) {
		throw new Error('Kredensial Meta WhatsApp atau nomor tujuan belum lengkap.');
	}
	const template = process.env.META_TEMPLATE_NAME?.trim();
	const body = template
		? {
				messaging_product: 'whatsapp',
				to: recipient,
				type: 'template',
				template: {
					name: template,
					language: { code: process.env.META_TEMPLATE_LANGUAGE || 'id' },
					...(process.env.META_TEMPLATE_VARIABLES
						? {
								components: [
									{
										type: 'body',
										parameters: JSON.parse(process.env.META_TEMPLATE_VARIABLES).map(
											(value) => ({ type: 'text', text: String(value) })
										)
									}
								]
							}
						: {})
				}
			}
		: {
				messaging_product: 'whatsapp',
				to: recipient,
				type: 'text',
				text: { preview_url: false, body: genericMessage }
			};
	const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20_000)
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(`Meta WhatsApp menolak pesan (${response.status}).`);
	}
	return payload.messages?.[0]?.id ? String(payload.messages[0].id) : 'meta-accepted';
}

async function sendTwilio() {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const from = process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_SENDER;
	if (!accountSid || !authToken || !from || !recipient) {
		throw new Error('Kredensial Twilio WhatsApp atau nomor tujuan belum lengkap.');
	}
	const body = new URLSearchParams({
		From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
		To: recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`,
		Body: genericMessage
	});
	const response = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
		{
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body,
			signal: AbortSignal.timeout(20_000)
		}
	);
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`Twilio menolak pesan (${response.status}).`);
	return payload.sid ? String(payload.sid) : 'twilio-accepted';
}

await client.connect();
try {
	await client.query(
		`UPDATE notification_outbox
		 SET status = 'pending', updated_at = now()
		 WHERE status = 'processing' AND updated_at < now() - interval '10 minutes'`
	);

	if (provider === 'outbox') {
		const pending = await client.query(
			`SELECT count(*)::int AS count FROM notification_outbox WHERE status = 'pending'`
		);
		console.log(
			`Provider outbox: ${pending.rows[0].count} notifikasi menunggu. Tidak ada pesan WhatsApp yang dikirim.`
		);
		process.exitCode = 0;
	} else if (provider !== 'meta' && provider !== 'twilio') {
		throw new Error('WHATSAPP_PROVIDER harus outbox, meta, atau twilio.');
	} else {
		let handled = 0;
		for (let index = 0; index < 10; index += 1) {
			const claimed = await client.query(
				`WITH next AS (
					SELECT id FROM notification_outbox
					WHERE status IN ('pending', 'failed') AND attempts < 8 AND next_attempt_at <= now()
					ORDER BY created_at ASC
					LIMIT 1
					FOR UPDATE SKIP LOCKED
				)
				UPDATE notification_outbox outbox
				SET status = 'processing', attempts = outbox.attempts + 1, updated_at = now()
				FROM next WHERE outbox.id = next.id
				RETURNING outbox.id, outbox.attempts`
			);
			const row = claimed.rows[0];
			if (!row) break;
			handled += 1;
			try {
				const providerRef = provider === 'meta' ? await sendMeta() : await sendTwilio();
				await client.query(
					`UPDATE notification_outbox
					 SET status = 'sent', provider_ref = $2, updated_at = now()
					 WHERE id = $1`,
					[row.id, providerRef]
				);
				console.log(`Notifikasi ${row.id} terkirim melalui ${provider}.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'kesalahan tidak diketahui';
				await client.query(
					`UPDATE notification_outbox
					 SET status = 'failed', next_attempt_at = now() + ($2::text || ' minutes')::interval,
					     updated_at = now()
					 WHERE id = $1`,
					[row.id, backoffMinutes(Number(row.attempts))]
				);
				console.error(`Notifikasi ${row.id} gagal: ${message}`);
			}
		}
		console.log(`${handled} notifikasi diproses melalui ${provider}.`);
	}
} finally {
	await client.end();
}
