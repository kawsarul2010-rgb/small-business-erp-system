-- Business size by volume, and special prices for one business.
--
--   business_size.max_orders_per_month   the most sales + purchase orders a month a business of this
--                                        size is expected to have (average of the last 3 months).
--                                        NULL: no limit (the largest size). A business above its
--                                        size's limit is shown to the super admin, who decides.
--   tenant.size_review_snoozed_until     "Keep this size": no alert for this business until then.
--   business_plan_price                  a price the super admin agreed with one business for a
--                                        package. It replaces the size's price for that business;
--                                        packages without one keep the size's price.

ALTER TABLE business_size ADD COLUMN max_orders_per_month integer NULL CHECK (max_orders_per_month IS NULL OR max_orders_per_month >= 0);
ALTER TABLE tenant ADD COLUMN size_review_snoozed_until timestamptz NULL;

CREATE TABLE business_plan_price (
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    plan_uuid             uuid NOT NULL REFERENCES subscription_plan (uuid) ON DELETE CASCADE,
    price                 numeric(12, 2) NOT NULL CHECK (price >= 0),
    updated_date          timestamptz NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    PRIMARY KEY (tenant_uuid, plan_uuid)
);

-- A business reads its own special prices (its Billing page); only the super admin sets them.
ALTER TABLE business_plan_price ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business_plan_price USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());
REVOKE INSERT, UPDATE, DELETE ON business_plan_price FROM erp_tenant;

-- Closing a business deletes its special prices too (same function as 0010, one line added).
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
