-- LAPOR AMAN — skema backend lokal.
-- Seed memakai data latihan; jangan gunakan data korban nyata.
-- Kolom *_enc/*_iv/*_tag menyimpan ciphertext AES-256-GCM, bukan plaintext.

CREATE TABLE IF NOT EXISTS roles (
	name text PRIMARY KEY,
	display_name text NOT NULL
);

INSERT INTO roles (name, display_name) VALUES
	('petugas', 'Petugas'),
	('bidan_pic', 'Bidan/PIC'),
	('admin', 'Admin'),
	('auditor', 'Auditor')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS staff_users (
	id uuid PRIMARY KEY,
	username text NOT NULL UNIQUE,
	display_name text NOT NULL,
	password_hash text NOT NULL,
	active boolean NOT NULL DEFAULT true,
	failed_login_attempts integer NOT NULL DEFAULT 0,
	locked_until timestamptz,
	last_login_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_roles (
	staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
	role text NOT NULL REFERENCES roles(name),
	scope text NOT NULL DEFAULT 'assigned' CHECK (scope IN ('assigned', 'all')),
	PRIMARY KEY (staff_id, role)
);

CREATE TABLE IF NOT EXISTS staff_sessions (
	id uuid PRIMARY KEY,
	staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
	session_secret_hash text NOT NULL UNIQUE,
	csrf_token text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS service_schedules (
	id uuid PRIMARY KEY,
	weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
	opens_at time NOT NULL,
	closes_at time NOT NULL,
	timezone text NOT NULL DEFAULT 'Asia/Makassar',
	effective_from date NOT NULL DEFAULT CURRENT_DATE,
	effective_to date,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK (opens_at < closes_at)
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
	date date PRIMARY KEY,
	is_closed boolean NOT NULL DEFAULT true,
	opens_at time,
	closes_at time,
	reason text NOT NULL,
	CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
	id uuid PRIMARY KEY,
	session_secret_hash text NOT NULL UNIQUE,
	mode text NOT NULL CHECK (mode IN ('operator', 'ai', 'unavailable')),
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'ended')),
	csrf_token text NOT NULL,
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS chat_messages (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
	sender_type text NOT NULL CHECK (sender_type IN ('user', 'assistant', 'service')),
	body_enc bytea NOT NULL,
	body_iv bytea NOT NULL,
	body_tag bytea NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_drafts (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
	version integer NOT NULL CHECK (version > 0),
	content_enc bytea NOT NULL,
	content_iv bytea NOT NULL,
	content_tag bytea NOT NULL,
	status text NOT NULL CHECK (status IN ('editing', 'ready_for_confirmation', 'confirmed')),
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (session_id, version)
);

CREATE TABLE IF NOT EXISTS victim_details (
	id uuid PRIMARY KEY,
	name_enc bytea NOT NULL,
	name_iv bytea NOT NULL,
	name_tag bytea NOT NULL,
	nik_enc bytea,
	nik_iv bytea,
	nik_tag bytea,
	nik_last4 text CHECK (nik_last4 IS NULL OR nik_last4 ~ '^[0-9]{4}$'),
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK ((nik_enc IS NULL AND nik_iv IS NULL AND nik_tag IS NULL) OR (nik_enc IS NOT NULL AND nik_iv IS NOT NULL AND nik_tag IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS reporter_details (
	id uuid PRIMARY KEY,
	relationship_enc bytea NOT NULL,
	relationship_iv bytea NOT NULL,
	relationship_tag bytea NOT NULL,
	safe_contact_allowed boolean NOT NULL,
	contact_enc bytea,
	contact_iv bytea,
	contact_tag bytea,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK ((contact_enc IS NULL AND contact_iv IS NULL AND contact_tag IS NULL) OR (contact_enc IS NOT NULL AND contact_iv IS NOT NULL AND contact_tag IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS reports (
	id uuid PRIMARY KEY,
	reference_code text NOT NULL UNIQUE,
	victim_id uuid NOT NULL REFERENCES victim_details(id),
	reporter_id uuid NOT NULL REFERENCES reporter_details(id),
	source_session_id uuid NOT NULL REFERENCES chat_sessions(id),
	draft_id uuid NOT NULL REFERENCES report_drafts(id),
	confirmed_draft_version integer NOT NULL CHECK (confirmed_draft_version > 0),
	content_enc bytea NOT NULL,
	content_iv bytea NOT NULL,
	content_tag bytea NOT NULL,
	status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'decision_recorded')),
	idempotency_key uuid NOT NULL UNIQUE,
	submitted_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_assignments (
	id uuid PRIMARY KEY,
	report_id uuid NOT NULL REFERENCES reports(id),
	staff_id uuid NOT NULL REFERENCES staff_users(id),
	assigned_by uuid REFERENCES staff_users(id),
	assigned_at timestamptz NOT NULL DEFAULT now(),
	revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS report_assignments_current_idx
	ON report_assignments (report_id, staff_id)
	WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS report_reviews (
	id uuid PRIMARY KEY,
	report_id uuid NOT NULL REFERENCES reports(id),
	reviewer_id uuid NOT NULL REFERENCES staff_users(id),
	notes_enc bytea NOT NULL,
	notes_iv bytea NOT NULL,
	notes_tag bytea NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_decisions (
	id uuid PRIMARY KEY,
	report_id uuid NOT NULL REFERENCES reports(id),
	decision text NOT NULL CHECK (decision IN ('follow_up_required', 'follow_up_not_required')),
	reason_enc bytea NOT NULL,
	reason_iv bytea NOT NULL,
	reason_tag bytea NOT NULL,
	decided_by uuid NOT NULL REFERENCES staff_users(id),
	decided_at timestamptz NOT NULL DEFAULT now(),
	superseded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS report_decisions_current_idx
	ON report_decisions (report_id)
	WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS privacy_acknowledgements (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES chat_sessions(id),
	report_id uuid NOT NULL REFERENCES reports(id),
	notice_version text NOT NULL,
	purpose text NOT NULL,
	acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
	id uuid PRIMARY KEY,
	report_id uuid NOT NULL REFERENCES reports(id),
	recipient_staff_id uuid REFERENCES staff_users(id),
	event_type text NOT NULL,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
	attempts integer NOT NULL DEFAULT 0,
	next_attempt_at timestamptz NOT NULL DEFAULT now(),
	provider_ref text,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
	id uuid PRIMARY KEY,
	actor_type text NOT NULL CHECK (actor_type IN ('anonymous', 'staff', 'system')),
	actor_id uuid,
	action text NOT NULL,
	object_type text NOT NULL,
	object_id text,
	occurred_at timestamptz NOT NULL DEFAULT now(),
	request_id text,
	metadata_minimal jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx ON chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS chat_sessions_expiry_idx ON chat_sessions (status, expires_at);
CREATE INDEX IF NOT EXISTS staff_sessions_expiry_idx ON staff_sessions (expires_at);
CREATE INDEX IF NOT EXISTS reports_status_submitted_idx ON reports (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS report_reviews_report_idx ON report_reviews (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_decisions_report_idx ON report_decisions (report_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS audit_events_occurred_idx ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_object_idx ON audit_events (object_type, object_id, occurred_at DESC);
