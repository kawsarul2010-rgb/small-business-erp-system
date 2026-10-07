-- Deleting accounts (Google Play requires that people can delete their account from the app).
--
--   app_forget_user(user)     one person: their sign-in details are erased, their sessions ended,
--                              and their name is removed from every record of their business
--                              (orders they created, payments they added...). The records stay:
--                              they belong to the business.
--   app_close_business(tenant) the last admin closes the whole business: every business record
--                              is deleted and every account is forgotten. Kept: the business row
--                              (name and code) and its subscription payments, which are accounting
--                              records of Tasif Matrix Limited.
--
-- Called by the application on the owner connection only; nobody else may run them.

ALTER TABLE tenant DROP CONSTRAINT IF EXISTS tenant_status_check;
ALTER TABLE tenant ADD CONSTRAINT tenant_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'));
ALTER TABLE tenant ADD COLUMN closed_date timestamptz NULL;

CREATE FUNCTION app_forget_user(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
    r record;
BEGIN
    SELECT tenant_uuid INTO v_tenant FROM app_user WHERE uuid = p_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'app_forget_user: no user %', p_user;
    END IF;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'app_forget_user: a super admin is not deleted this way';
    END IF;

    -- "... by <name>" on every business record: found by column name, so new tables are covered
    -- without changing this function. Subscription payments are accounting records and keep theirs.
    FOR r IN
        SELECT c.table_name, c.column_name, replace(c.column_name, '_user_name', '_user_uuid') AS uuid_column
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name LIKE '%\_by\_user\_name'
          AND c.table_name <> 'billing_payment'
          AND EXISTS (SELECT 1 FROM information_schema.columns t
                      WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.column_name = 'tenant_uuid')
          AND EXISTS (SELECT 1 FROM information_schema.columns u
                      WHERE u.table_schema = 'public' AND u.table_name = c.table_name
                        AND u.column_name = replace(c.column_name, '_user_name', '_user_uuid'))
    LOOP
        EXECUTE format('UPDATE %I SET %I = %L WHERE tenant_uuid = $1 AND %I = $2',
                       r.table_name, r.column_name, 'Deleted user', r.uuid_column)
            USING v_tenant, p_user;
    END LOOP;
    UPDATE tenant SET created_by_user_name = 'Deleted user' WHERE uuid = v_tenant AND created_by_user_uuid = p_user;
    UPDATE tenant SET updated_by_user_name = 'Deleted user' WHERE uuid = v_tenant AND updated_by_user_uuid = p_user;

    DELETE FROM refresh_token WHERE user_uuid = p_user;
    DELETE FROM password_reset_token WHERE user_uuid = p_user;

    -- The row stays (status DELETED) so references to the person keep working; nothing in it
    -- identifies them any more, and the email can be used again for a new account.
    UPDATE app_user
    SET status = 'DELETED',
        user_name = 'Deleted user',
        email = 'deleted-' || replace(uuid::text, '-', '') || '@deleted.invalid',
        phone_number = '',
        password_hash = '!deleted',
        supplier_uuid = NULL,
        customer_uuid = NULL,
        last_login_date = NULL,
        failed_login_count = 0,
        lockout_end_date = NULL,
        must_change_password = false,
        posts_seen_at = NULL,
        revision = gen_random_uuid(),
        updated_date = now()
    WHERE uuid = p_user;
END $$;

CREATE FUNCTION app_close_business(p_tenant uuid) RETURNS void
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

REVOKE ALL ON FUNCTION app_forget_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_close_business(uuid) FROM PUBLIC;
