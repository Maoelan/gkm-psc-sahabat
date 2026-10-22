CREATE TABLE IF NOT EXISTS chat_assistance (
	session_id uuid PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
	fingerprint text NOT NULL,
	content_enc bytea NOT NULL,
	content_iv bytea NOT NULL,
	content_tag bytea NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
