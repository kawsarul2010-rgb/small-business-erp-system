-- ---------------------------------------------------------------------------
-- 0019 - Memo scan (feature 3 of the AI plan): a photo of a supplier's memo becomes a draft
-- purchase order, which the person checks and saves.
--
--   ai_settings.memo_model     the model that reads the photo; the super admin chooses it
--   ai_usage feature           MEMO_SCAN joins HELP and ASK_BUSINESS
--   ai_usage.items_proposed    lines the scan put in the draft
--   ai_usage.items_unchanged   of those, lines saved exactly as read - the reader's accuracy
--
-- The photo itself is never stored, and neither is what the model read from it.
-- ---------------------------------------------------------------------------

ALTER TABLE ai_settings ADD COLUMN memo_model varchar(100) NOT NULL DEFAULT 'claude-haiku-5-5';

ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_feature_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_feature_check CHECK (feature IN ('HELP','ASK_BUSINESS','MEMO_SCAN'));

ALTER TABLE ai_usage
    ADD COLUMN items_proposed  integer NULL CHECK (items_proposed >= 0),
    ADD COLUMN items_unchanged integer NULL CHECK (items_unchanged >= 0);

-- A business records how its own scans turned out; still no rewriting the rest of the log.
GRANT UPDATE (items_unchanged) ON ai_usage TO erp_tenant;
