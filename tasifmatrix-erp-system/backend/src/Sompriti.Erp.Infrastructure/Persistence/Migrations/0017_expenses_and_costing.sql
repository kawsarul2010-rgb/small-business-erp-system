-- ---------------------------------------------------------------------------
-- 0017 - Expenses, and the cost of what was sold (for the profit report).
--
-- Expenses: what a business spends on running itself - salary, rent, transport, bills.
-- Each business has its own list of categories, starting with a default list.
-- An expense is never deleted: a mistake is voided with a reason and stays visible.
--
-- Cost of goods sold, by weighted average cost:
--   stock_balance.average_cost        what one base unit on the shelf cost, on average
--   sales_order_line_item.unit_cost   that average, frozen when the sale is finalized
--   stock_adjustment.unit_cost        the same for a damage, loss or correction
-- Profit = sales - cost of goods sold - expenses - stock lost or damaged.
--
-- Existing data starts from each product's purchase price: the average cost of stock
-- already on the shelf, and the cost of sales finalized before this release.
-- ---------------------------------------------------------------------------

-- ---------- Cost of goods ----------
ALTER TABLE stock_balance ADD COLUMN average_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (average_cost >= 0);
UPDATE stock_balance s SET average_cost = p.product_purchase_price
FROM product p WHERE p.uuid = s.product_uuid;

ALTER TABLE sales_order_line_item ADD COLUMN unit_cost numeric(18,4) NULL CHECK (unit_cost IS NULL OR unit_cost >= 0);
UPDATE sales_order_line_item l SET unit_cost = p.product_purchase_price
FROM sales_order o, product p
WHERE o.uuid = l.sales_order_uuid AND p.uuid = l.product_uuid AND o.posting_status IN ('FINAL', 'VOID');

ALTER TABLE stock_adjustment ADD COLUMN unit_cost numeric(18,4) NULL CHECK (unit_cost IS NULL OR unit_cost >= 0);
UPDATE stock_adjustment a SET unit_cost = p.product_purchase_price
FROM product p WHERE p.uuid = a.product_uuid;

-- ---------- Expense categories ----------
CREATE TABLE expense_category (
    uuid                  uuid PRIMARY KEY,
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    category_name         varchar(100) NOT NULL CHECK (btrim(category_name) <> ''),
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    status                varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DELETED'))
);
-- Two active categories of one business cannot share a name ("Rent" and "rent").
CREATE UNIQUE INDEX ux_expense_category_name ON expense_category (tenant_uuid, lower(category_name)) WHERE status = 'ACTIVE';

-- ---------- Expenses ----------
CREATE TABLE expense (
    uuid                  uuid PRIMARY KEY,
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    expense_number        varchar(20) NOT NULL,
    expense_date          date NOT NULL,
    category_uuid         uuid NOT NULL REFERENCES expense_category (uuid) ON DELETE RESTRICT,
    amount                numeric(18,2) NOT NULL CHECK (amount > 0),
    paid_to               varchar(150) NULL,
    payment_method        varchar(20) NOT NULL CHECK (payment_method IN ('CASH','BANK','MOBILE_BANKING','CHEQUE','OTHER')),
    note                  varchar(500) NULL,
    voided_date           timestamptz NULL,
    voided_by_user_uuid   uuid NULL,
    voided_by_user_name   varchar(100) NULL,
    void_reason           varchar(500) NULL,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ux_expense_number UNIQUE (tenant_uuid, expense_number),
    CONSTRAINT ck_expense_void CHECK ((voided_date IS NULL) = (void_reason IS NULL))
);
CREATE INDEX ix_expense_date ON expense (tenant_uuid, expense_date);
CREATE INDEX ix_expense_category ON expense (category_uuid);

CREATE TRIGGER trg_expense_number BEFORE INSERT ON expense
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('expense_number', 'EXPENSE');

ALTER TABLE expense_category ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expense_category USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());
ALTER TABLE expense ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expense USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());
-- Expenses are voided, never deleted; a category is switched off (status), never deleted.
REVOKE DELETE ON expense, expense_category FROM erp_tenant;

-- Every existing business starts with the default categories (new ones get them on sign-up).
INSERT INTO expense_category (uuid, tenant_uuid, category_name, revision, created_date, updated_date,
                              created_by_user_uuid, updated_by_user_uuid, created_by_user_name, updated_by_user_name)
SELECT gen_random_uuid(), t.uuid, d.name, gen_random_uuid(), now(), now(),
       '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'
FROM tenant t
CROSS JOIN (VALUES ('Salary'), ('Rent'), ('Utility bills'), ('Transport'), ('Loading and labour'), ('Mobile and internet'),
                   ('Food and entertainment'), ('Repair and maintenance'), ('Office supplies'), ('Others')) AS d (name)
WHERE t.status <> 'CLOSED';

-- ---------- Closing a business deletes its expenses too (same function as 0013, two lines added) ----------
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
