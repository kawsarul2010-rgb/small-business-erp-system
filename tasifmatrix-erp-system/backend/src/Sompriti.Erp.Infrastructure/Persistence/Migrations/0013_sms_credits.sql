-- Prepaid SMS: a business buys SMS before it can send them.
--
--   billing_settings.sms_*      the super admin's SMS settings: whether SMS must be bought (off until
--                               switched on), the price per SMS, how many months a pack lasts, the
--                               smallest purchase, and the free SMS a new business gets.
--   billing_payment.sms_*       SMS bought with a payment: alone (no package, duration 0) or
--                               together with a package.
--   sms_credit                  every pack of SMS a business has: bought, free, or added by the
--                               super admin. A message uses the pack that expires first.
--   sms_outbox.charged_parts    SMS taken from the balance for a message, given back if it fails.
--   tenant.sms_price            (unchanged) now this business's special price per SMS.

ALTER TABLE billing_settings ADD COLUMN sms_credit_required boolean NOT NULL DEFAULT false;
ALTER TABLE billing_settings ADD COLUMN sms_unit_price      numeric(10, 2) NOT NULL DEFAULT 0.55 CHECK (sms_unit_price >= 0);
ALTER TABLE billing_settings ADD COLUMN sms_validity_months integer NOT NULL DEFAULT 3 CHECK (sms_validity_months BETWEEN 1 AND 36);
ALTER TABLE billing_settings ADD COLUMN sms_min_purchase    integer NOT NULL DEFAULT 100 CHECK (sms_min_purchase BETWEEN 1 AND 100000);
ALTER TABLE billing_settings ADD COLUMN sms_free_on_signup  integer NOT NULL DEFAULT 20 CHECK (sms_free_on_signup BETWEEN 0 AND 10000);

ALTER TABLE billing_payment ADD COLUMN sms_quantity   integer NOT NULL DEFAULT 0 CHECK (sms_quantity BETWEEN 0 AND 100000);
ALTER TABLE billing_payment ADD COLUMN sms_unit_price numeric(10, 2) NULL CHECK (sms_unit_price IS NULL OR sms_unit_price >= 0);

ALTER TABLE sms_outbox ADD COLUMN charged_parts smallint NOT NULL DEFAULT 0 CHECK (charged_parts BETWEEN 0 AND 20);

CREATE TABLE sms_credit (
    uuid                  uuid PRIMARY KEY,
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    source                varchar(10) NOT NULL CHECK (source IN ('PURCHASE','FREE','MANUAL')),
    quantity              integer NOT NULL CHECK (quantity > 0),
    used_quantity         integer NOT NULL DEFAULT 0,
    unit_price            numeric(10, 2) NULL CHECK (unit_price IS NULL OR unit_price >= 0),
    payment_uuid          uuid NULL REFERENCES billing_payment (uuid) ON DELETE SET NULL,
    note                  varchar(300) NULL,
    expires_at            timestamptz NOT NULL,
    created_date          timestamptz NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ck_sms_credit_used CHECK (used_quantity BETWEEN 0 AND quantity)
);
CREATE INDEX ix_sms_credit_tenant ON sms_credit (tenant_uuid, expires_at);
-- A payment adds its SMS once, however many times bKash calls back.
CREATE UNIQUE INDEX ux_sms_credit_payment ON sms_credit (payment_uuid) WHERE payment_uuid IS NOT NULL;

-- A business reads its own packs and uses them up (used_quantity only); it cannot add or change them.
ALTER TABLE sms_credit ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sms_credit USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());
REVOKE INSERT, UPDATE, DELETE ON sms_credit FROM erp_tenant;
GRANT UPDATE (used_quantity) ON sms_credit TO erp_tenant;

-- Closing a business deletes its SMS packs too (same function as 0012, one line added).
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
        revision = gen_random_uuid(),
        updated_date = now()
    WHERE uuid = p_tenant;
END $$;
