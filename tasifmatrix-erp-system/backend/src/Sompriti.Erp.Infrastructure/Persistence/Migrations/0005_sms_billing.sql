-- SMS billing per business.
--
-- sms_outbox.sms_parts: how many SMS parts the operator charges for a message (a long message is
--   sent as several parts). Stored when the message is queued, so a bill never changes later.
-- tenant.sms_price: what the platform owner charges this business per SMS part (taka). Null means
--   "not charged" - usage is still counted.

ALTER TABLE sms_outbox ADD COLUMN sms_parts smallint NOT NULL DEFAULT 1 CHECK (sms_parts BETWEEN 1 AND 20);

-- Existing rows: 160 / 153 characters per part for plain text, 70 / 67 when it has any non-ASCII
-- character (Bangla, for instance), which the operators send as Unicode.
UPDATE sms_outbox SET sms_parts = LEAST(20, CASE
    WHEN message ~ '[^\x01-\x7E]' THEN CASE WHEN length(message) <= 70 THEN 1 ELSE ceil(length(message) / 67.0)::int END
    ELSE CASE WHEN length(message) <= 160 THEN 1 ELSE ceil(length(message) / 153.0)::int END
END);

ALTER TABLE tenant ADD COLUMN sms_price numeric(10, 2) NULL CHECK (sms_price IS NULL OR sms_price >= 0);

-- Monthly counts for the platform screens read sent messages by business and date.
CREATE INDEX IF NOT EXISTS ix_sms_outbox_tenant_sent ON sms_outbox (tenant_uuid, sent_date) WHERE status = 'SENT';
