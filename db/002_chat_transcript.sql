-- Sumber pesan percakapan untuk riwayat yang dapat ditinjau petugas.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS source text;

UPDATE chat_messages
SET source = CASE sender_type
	WHEN 'user' THEN 'user'
	WHEN 'assistant' THEN 'ai'
	ELSE 'guide'
END
WHERE source IS NULL;

ALTER TABLE chat_messages ALTER COLUMN source SET DEFAULT 'guide';
ALTER TABLE chat_messages ALTER COLUMN source SET NOT NULL;

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_source_check;
ALTER TABLE chat_messages
	ADD CONSTRAINT chat_messages_source_check
	CHECK (source IN ('user', 'ai', 'fallback', 'guide'));
