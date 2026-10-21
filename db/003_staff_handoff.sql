-- Opsi 3: pelapor dapat meminta bantuan petugas di tengah percakapan.
-- Satu sesi hanya boleh memiliki satu handoff yang masih terbuka.

CREATE TABLE IF NOT EXISTS chat_handoffs (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'waiting'
		CHECK (status IN ('waiting', 'active', 'closed', 'cancelled')),
	requested_at timestamptz NOT NULL DEFAULT now(),
	claimed_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
	claimed_at timestamptz,
	closed_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
	closed_at timestamptz,
	close_reason text
		CHECK (close_reason IS NULL OR close_reason IN ('staff_closed', 'reporter_cancelled', 'session_ended')),
	CHECK (status <> 'active' OR claimed_by IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_handoffs_open_session_idx
	ON chat_handoffs (session_id)
	WHERE status IN ('waiting', 'active');

CREATE INDEX IF NOT EXISTS chat_handoffs_queue_idx
	ON chat_handoffs (status, requested_at);

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_type_check;
ALTER TABLE chat_messages
	ADD CONSTRAINT chat_messages_sender_type_check
	CHECK (sender_type IN ('user', 'assistant', 'service', 'staff'));

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_source_check;
ALTER TABLE chat_messages
	ADD CONSTRAINT chat_messages_source_check
	CHECK (source IN ('user', 'ai', 'fallback', 'guide', 'staff', 'handoff'));

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS handoff_id uuid REFERENCES chat_handoffs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_handoff_created_idx
	ON chat_messages (handoff_id, created_at, id);

CREATE INDEX IF NOT EXISTS chat_messages_staff_created_idx
	ON chat_messages (staff_id, created_at)
	WHERE staff_id IS NOT NULL;
