import { randomUUID } from 'node:crypto';
import { db } from './db';

type Queryable = {
	query: (text: string, values?: unknown[]) => Promise<unknown>;
};

export type AuditInput = {
	actorType: 'anonymous' | 'staff' | 'system';
	actorId?: string | null;
	action: string;
	objectType: string;
	objectId?: string | null;
	requestId?: string | null;
	metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Audit hanya menyimpan metadata minimum. Jangan pernah mengirim isi cerita,
 * nama korban, NIK, kontak, atau pesan WhatsApp ke fungsi ini.
 */
export async function recordAudit(input: AuditInput, client: Queryable = db) {
	await client.query(
		`INSERT INTO audit_events
		 (id, actor_type, actor_id, action, object_type, object_id, request_id, metadata_minimal)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
		[
			randomUUID(),
			input.actorType,
			input.actorId ?? null,
			input.action,
			input.objectType,
			input.objectId ?? null,
			input.requestId ?? null,
			JSON.stringify(input.metadata ?? {})
		]
	);
}
