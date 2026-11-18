-- ---------------------------------------------------------------------------
-- 0018 - AI foundation (step 0 of the AI plan) and the help assistant (step 1).
--
--   ai_settings          one row, kept by the super admin: AI on/off for the platform, the
--                        model of each feature, effort, daily limit per business
--   tenant.ai_enabled    the super admin turns AI on for each business separately
--   ai_usage             one row per question: feature, model, tokens, cost, time, success,
--                        thumbs up/down. The question and answer are NOT stored.
--
-- The API key is not in the database: it is the server's ANTHROPIC_API_KEY variable.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_settings (
    id                        integer PRIMARY KEY CHECK (id = 1),
    ai_enabled                boolean NOT NULL DEFAULT false,
    help_model                varchar(100) NOT NULL DEFAULT 'claude-haiku-5-5',
    business_model            varchar(100) NOT NULL DEFAULT 'claude-haiku-5-5',
    effort                    varchar(10) NOT NULL DEFAULT 'low' CHECK (effort IN ('low','medium','high')),
    daily_limit_per_business  integer NOT NULL DEFAULT 30 CHECK (daily_limit_per_business BETWEEN 1 AND 10000),
    max_output_tokens         integer NOT NULL DEFAULT 2048 CHECK (max_output_tokens BETWEEN 256 AND 16000),
    updated_date              timestamptz NOT NULL,
    updated_by_user_name      varchar(100) NOT NULL
);
INSERT INTO ai_settings (id, updated_date, updated_by_user_name) VALUES (1, now(), 'SYSTEM');
-- Businesses read the settings (which model, the limit); only the super admin changes them.
REVOKE INSERT, UPDATE, DELETE ON ai_settings FROM erp_tenant;

ALTER TABLE tenant ADD COLUMN ai_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE ai_usage (
    uuid                uuid PRIMARY KEY,
    tenant_uuid         uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    user_uuid           uuid NOT NULL,
    feature             varchar(20) NOT NULL CHECK (feature IN ('HELP','ASK_BUSINESS')),
    model               varchar(100) NOT NULL,
    input_tokens        integer NOT NULL DEFAULT 0,
    output_tokens       integer NOT NULL DEFAULT 0,
    cache_read_tokens   integer NOT NULL DEFAULT 0,
    cache_write_tokens  integer NOT NULL DEFAULT 0,
    cost_usd            numeric(12,6) NULL,
    latency_ms          integer NOT NULL DEFAULT 0,
    model_calls         integer NOT NULL DEFAULT 0,
    success             boolean NOT NULL,
    error_code          varchar(50) NULL,
    rating              smallint NULL CHECK (rating IN (-1, 1)),
    created_date        timestamptz NOT NULL
);
CREATE INDEX ix_ai_usage_tenant_date ON ai_usage (tenant_uuid, created_date);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_usage USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());
-- A business logs its own questions and rates its own answers; it cannot rewrite or delete the log.
REVOKE UPDATE, DELETE ON ai_usage FROM erp_tenant;
GRANT UPDATE (rating) ON ai_usage TO erp_tenant;

-- ---------- Closing a business deletes its AI usage too (same function as 0017, one line added) ----------
CREATE OR REPLACE FUNCTION app_close_business(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    r record;
    v_left bigint;
BEGIN
    PERFORM 1 FROM tenant WHERE uuid = p_tenant FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'app_close_business: no business %', p_tenant;
    END IF;

    -- accounts no longer point at customers or suppliers about to be deleted
    UPDATE app_user SET customer_uuid = NULL, supplier_uuid = NULL WHERE tenant_uuid = p_tenant;

    DELETE FROM sales_order_payment      WHERE tenant_uuid = p_tenant;
    DELETE FROM sales_order_line_item    WHERE tenant_uuid = p_tenant;
    DELETE FROM sales_order              WHERE tenant_uuid = p_tenant;
    DELETE FROM purchase_order_payment   WHERE tenant_uuid = p_tenant;
    DELETE FROM purchase_order_line_item WHERE tenant_uuid = p_tenant;
    DELETE FROM purchase_order           WHERE tenant_uuid = p_tenant;
    DELETE FROM stock_ledger             WHERE tenant_uuid = p_tenant;
    DELETE FROM stock_adjustment         WHERE tenant_uuid = p_tenant;
    DELETE FROM stock_balance            WHERE tenant_uuid = p_tenant;
    DELETE FROM product                  WHERE tenant_uuid = p_tenant;
    DELETE FROM sms_outbox               WHERE tenant_uuid = p_tenant;
    DELETE FROM customer                 WHERE tenant_uuid = p_tenant;
    DELETE FROM supplier                 WHERE tenant_uuid = p_tenant;
    DELETE FROM expense                  WHERE tenant_uuid = p_tenant;
    DELETE FROM expense_category         WHERE tenant_uuid = p_tenant;
    DELETE FROM ai_usage                 WHERE tenant_uuid = p_tenant;
    DELETE FROM company                  WHERE tenant_uuid = p_tenant;
    DELETE FROM business_setting         WHERE tenant_uuid = p_tenant;
    DELETE FROM tenant_counter           WHERE tenant_uuid = p_tenant;
    DELETE FROM business_plan_price      WHERE tenant_uuid = p_tenant;
    DELETE FROM sms_credit               WHERE tenant_uuid = p_tenant;

    FOR r IN SELECT uuid FROM app_user WHERE tenant_uuid = p_tenant LOOP
        PERFORM app_forget_user(r.uuid);
    END LOOP;

    -- A table added later and not deleted above would keep the business's data: refuse instead.
    FOR r IN
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name = 'tenant_uuid'
          AND c.table_name NOT IN ('app_user', 'billing_payment')
    LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE tenant_uuid = $1', r.table_name) INTO v_left USING p_tenant;
        IF v_left > 0 THEN
            RAISE EXCEPTION 'app_close_business: table % still has rows of business %; add it to app_close_business', r.table_name, p_tenant;
        END IF;
    END LOOP;

    UPDATE tenant
    SET status = 'CLOSED',
        closed_date = now(),
        contact_name = NULL,
        contact_email = NULL,
        contact_phone = NULL,
        notes = NULL,
        suspended_date = NULL,
        suspend_reason = NULL,
        ai_enabled = false,
        revision = gen_random_uuid(),
        updated_date = now()
    WHERE uuid = p_tenant;
END $$;
