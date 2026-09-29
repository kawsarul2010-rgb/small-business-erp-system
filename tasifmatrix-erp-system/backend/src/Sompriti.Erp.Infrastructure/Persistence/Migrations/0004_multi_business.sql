-- =====================================================================
-- 0004 - Many businesses in one database
--
-- Every business (a "tenant") gets its own customers, products, orders,
-- stock and users. Nothing may cross from one business to another, so
-- the separation is enforced three ways, each able to stop a leak alone:
--
--   1. The application filters every query by the signed-in business.
--   2. Row-Level Security: requests run as the role erp_tenant, and
--      PostgreSQL itself hides rows of other businesses, even from a
--      query that forgot its filter.
--   3. Composite foreign keys: a row can only reference rows of its own
--      business, so an order line cannot point at another business's
--      product even if someone guesses its id.
--
-- Codes and numbers (customer, supplier, invoice, PO, adjustment) are
-- counted per business, so every business starts at 100001 and one
-- business cannot infer another's volume from its invoice numbers.
--
-- An existing single-business database is upgraded in place: all its
-- data becomes the first business, and numbering continues from where
-- it was.
--
-- RULE FOR FUTURE MIGRATIONS: a new table that holds business data must
-- get a tenant_uuid column, ENABLE ROW LEVEL SECURITY and a policy.
-- The application refuses to start if a table has tenant_uuid without
-- row-level security (see DatabaseInitializer).
-- =====================================================================

-- ---------- The business ----------
CREATE TABLE tenant (
    uuid                  uuid PRIMARY KEY,
    tenant_code           varchar(30)  NOT NULL,
    tenant_name           varchar(150) NOT NULL,
    status                varchar(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
    contact_name          varchar(100) NULL,
    contact_email         varchar(200) NULL,
    contact_phone         varchar(13)  NULL,
    notes                 varchar(1000) NULL,
    suspended_date        timestamptz  NULL,
    suspend_reason        varchar(500) NULL,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ux_tenant_code UNIQUE (tenant_code),
    -- 3-30 characters: lowercase letters, digits and hyphens, not at either end.
    CONSTRAINT ck_tenant_code CHECK (tenant_code ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$')
);

-- ---------- Existing data becomes the first business ----------
-- Only when there is data to adopt; a fresh database starts with none,
-- and the super admin creates businesses from the platform screens.
CREATE TEMP TABLE _default_tenant (uuid uuid) ON COMMIT DROP;

WITH created AS (
    INSERT INTO tenant (uuid, tenant_code, tenant_name, revision, created_date, updated_date,
                        created_by_user_uuid, updated_by_user_uuid, created_by_user_name, updated_by_user_name)
    SELECT gen_random_uuid(), 'main',
           COALESCE((SELECT company_name FROM company ORDER BY created_date LIMIT 1), 'My business'),
           gen_random_uuid(), now(), now(),
           '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'
    WHERE EXISTS (SELECT 1 FROM app_user) OR EXISTS (SELECT 1 FROM company)  OR EXISTS (SELECT 1 FROM customer)
       OR EXISTS (SELECT 1 FROM supplier) OR EXISTS (SELECT 1 FROM product)  OR EXISTS (SELECT 1 FROM stock_balance)
       OR EXISTS (SELECT 1 FROM stock_ledger) OR EXISTS (SELECT 1 FROM stock_adjustment)
       OR EXISTS (SELECT 1 FROM purchase_order) OR EXISTS (SELECT 1 FROM sales_order) OR EXISTS (SELECT 1 FROM sms_outbox)
    RETURNING uuid
)
INSERT INTO _default_tenant SELECT uuid FROM created;

-- ---------- tenant_uuid on every business-owned table ----------
DO $$
DECLARE
    t text;
    v_default uuid := (SELECT uuid FROM _default_tenant);
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'company', 'customer', 'supplier', 'product',
        'stock_balance', 'stock_adjustment', 'stock_ledger',
        'purchase_order', 'purchase_order_line_item', 'purchase_order_payment',
        'sales_order', 'sales_order_line_item', 'sales_order_payment',
        'sms_outbox']
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_uuid uuid NULL', t);
        EXECUTE format('UPDATE %I SET tenant_uuid = $1', t) USING v_default;
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_uuid SET NOT NULL', t);
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_uuid) REFERENCES tenant (uuid) ON DELETE RESTRICT',
                       t, 'fk_' || t || '_tenant');
    END LOOP;
END $$;

-- Users: a super admin belongs to no business; everyone else to exactly one.
ALTER TABLE app_user ADD COLUMN tenant_uuid uuid NULL REFERENCES tenant (uuid) ON DELETE RESTRICT;
UPDATE app_user SET tenant_uuid = (SELECT uuid FROM _default_tenant);

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ALTER COLUMN role TYPE varchar(20);
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('SUPER_ADMIN','ADMIN','MANAGER','USER'));
ALTER TABLE app_user ADD CONSTRAINT ck_app_user_tenant CHECK ((role = 'SUPER_ADMIN') = (tenant_uuid IS NULL));
ALTER TABLE app_user ADD CONSTRAINT ck_app_user_super_admin_links
    CHECK (role <> 'SUPER_ADMIN' OR (supplier_uuid IS NULL AND customer_uuid IS NULL));
CREATE INDEX ix_app_user_tenant ON app_user (tenant_uuid);

-- ---------- Codes and numbers are unique per business, not globally ----------
-- Same constraint names as before, so error handling that looks at them keeps working.
ALTER TABLE company          DROP CONSTRAINT ux_company_code;
ALTER TABLE company          ADD  CONSTRAINT ux_company_code            UNIQUE (tenant_uuid, company_code);
ALTER TABLE customer         DROP CONSTRAINT ux_customer_code;
ALTER TABLE customer         ADD  CONSTRAINT ux_customer_code           UNIQUE (tenant_uuid, customer_code);
ALTER TABLE supplier         DROP CONSTRAINT ux_supplier_code;
ALTER TABLE supplier         ADD  CONSTRAINT ux_supplier_code           UNIQUE (tenant_uuid, supplier_code);
ALTER TABLE product          DROP CONSTRAINT ux_product_code;
ALTER TABLE product          ADD  CONSTRAINT ux_product_code            UNIQUE (tenant_uuid, product_code);
ALTER TABLE stock_adjustment DROP CONSTRAINT ux_stock_adjustment_number;
ALTER TABLE stock_adjustment ADD  CONSTRAINT ux_stock_adjustment_number UNIQUE (tenant_uuid, adjustment_number);
ALTER TABLE purchase_order   DROP CONSTRAINT ux_purchase_order_number;
ALTER TABLE purchase_order   ADD  CONSTRAINT ux_purchase_order_number   UNIQUE (tenant_uuid, purchase_order_number);
ALTER TABLE sales_order      DROP CONSTRAINT ux_sales_order_number;
ALTER TABLE sales_order      ADD  CONSTRAINT ux_sales_order_number      UNIQUE (tenant_uuid, sales_order_number);

-- ---------- References may only point inside the same business ----------
-- Parents expose (tenant_uuid, uuid) so children can reference both together.
ALTER TABLE company        ADD CONSTRAINT ux_company_tenant_uuid        UNIQUE (tenant_uuid, uuid);
ALTER TABLE customer       ADD CONSTRAINT ux_customer_tenant_uuid       UNIQUE (tenant_uuid, uuid);
ALTER TABLE supplier       ADD CONSTRAINT ux_supplier_tenant_uuid       UNIQUE (tenant_uuid, uuid);
ALTER TABLE product        ADD CONSTRAINT ux_product_tenant_uuid        UNIQUE (tenant_uuid, uuid);
ALTER TABLE purchase_order ADD CONSTRAINT ux_purchase_order_tenant_uuid UNIQUE (tenant_uuid, uuid);
ALTER TABLE sales_order    ADD CONSTRAINT ux_sales_order_tenant_uuid    UNIQUE (tenant_uuid, uuid);

-- Drop the old single-column references to those parents (their names were generated by PostgreSQL)...
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass AS tbl, c.conname
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND array_length(c.conkey, 1) = 1
          AND c.confrelid::regclass::text IN ('company', 'customer', 'supplier', 'product', 'purchase_order', 'sales_order')
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END $$;

-- ...and replace them with references that include the business.
ALTER TABLE app_user ADD CONSTRAINT fk_app_user_supplier FOREIGN KEY (tenant_uuid, supplier_uuid) REFERENCES supplier (tenant_uuid, uuid);
ALTER TABLE app_user ADD CONSTRAINT fk_app_user_customer FOREIGN KEY (tenant_uuid, customer_uuid) REFERENCES customer (tenant_uuid, uuid);

ALTER TABLE stock_balance    ADD CONSTRAINT fk_stock_balance_product    FOREIGN KEY (tenant_uuid, product_uuid) REFERENCES product (tenant_uuid, uuid);
ALTER TABLE stock_adjustment ADD CONSTRAINT fk_stock_adjustment_product FOREIGN KEY (tenant_uuid, product_uuid) REFERENCES product (tenant_uuid, uuid);
ALTER TABLE stock_ledger     ADD CONSTRAINT fk_stock_ledger_product     FOREIGN KEY (tenant_uuid, product_uuid) REFERENCES product (tenant_uuid, uuid);

ALTER TABLE purchase_order ADD CONSTRAINT fk_purchase_order_company  FOREIGN KEY (tenant_uuid, company_uuid)  REFERENCES company  (tenant_uuid, uuid);
ALTER TABLE purchase_order ADD CONSTRAINT fk_purchase_order_supplier FOREIGN KEY (tenant_uuid, supplier_uuid) REFERENCES supplier (tenant_uuid, uuid);
ALTER TABLE purchase_order_line_item ADD CONSTRAINT fk_po_line_order   FOREIGN KEY (tenant_uuid, purchase_order_uuid) REFERENCES purchase_order (tenant_uuid, uuid);
ALTER TABLE purchase_order_line_item ADD CONSTRAINT fk_po_line_product FOREIGN KEY (tenant_uuid, product_uuid)        REFERENCES product        (tenant_uuid, uuid);
ALTER TABLE purchase_order_payment   ADD CONSTRAINT fk_po_payment_order FOREIGN KEY (tenant_uuid, purchase_order_uuid) REFERENCES purchase_order (tenant_uuid, uuid);

ALTER TABLE sales_order ADD CONSTRAINT fk_sales_order_company  FOREIGN KEY (tenant_uuid, company_uuid)  REFERENCES company  (tenant_uuid, uuid);
ALTER TABLE sales_order ADD CONSTRAINT fk_sales_order_customer FOREIGN KEY (tenant_uuid, customer_uuid) REFERENCES customer (tenant_uuid, uuid);
ALTER TABLE sales_order_line_item ADD CONSTRAINT fk_so_line_order   FOREIGN KEY (tenant_uuid, sales_order_uuid) REFERENCES sales_order (tenant_uuid, uuid);
ALTER TABLE sales_order_line_item ADD CONSTRAINT fk_so_line_product FOREIGN KEY (tenant_uuid, product_uuid)     REFERENCES product     (tenant_uuid, uuid);
ALTER TABLE sales_order_payment   ADD CONSTRAINT fk_so_payment_order FOREIGN KEY (tenant_uuid, sales_order_uuid) REFERENCES sales_order (tenant_uuid, uuid);

-- ---------- Indexes that lead with the business ----------
DROP INDEX IF EXISTS ix_purchase_order_status_date;
DROP INDEX IF EXISTS ix_sales_order_status_date;
CREATE INDEX ix_purchase_order_status_date ON purchase_order (tenant_uuid, status, posting_status, order_date);
CREATE INDEX ix_sales_order_status_date    ON sales_order    (tenant_uuid, status, posting_status, order_date);
CREATE INDEX ix_stock_ledger_tenant_date   ON stock_ledger   (tenant_uuid, created_date);
CREATE INDEX ix_sms_outbox_tenant_date     ON sms_outbox     (tenant_uuid, created_date);

-- ---------- Numbering per business ----------
CREATE TABLE tenant_counter (
    tenant_uuid   uuid        NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    counter_name  varchar(30) NOT NULL,
    next_value    bigint      NOT NULL,
    PRIMARY KEY (tenant_uuid, counter_name)
);

-- An upgraded business continues exactly where its old global sequence stopped, so a number
-- is never handed out twice - not even one whose row was later removed.
CREATE TEMP TABLE _seq_next (counter_name text, next_value bigint) ON COMMIT DROP;
INSERT INTO _seq_next
SELECT 'CUSTOMER',         CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM customer_code_seq
UNION ALL SELECT 'SUPPLIER',         CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM supplier_code_seq
UNION ALL SELECT 'PURCHASE_ORDER',   CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM purchase_order_number_seq
UNION ALL SELECT 'SALES_ORDER',      CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM sales_order_number_seq
UNION ALL SELECT 'STOCK_ADJUSTMENT', CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM stock_adjustment_number_seq;

INSERT INTO tenant_counter (tenant_uuid, counter_name, next_value)
SELECT d.uuid, s.counter_name, GREATEST(s.next_value, 100001)
FROM _default_tenant d CROSS JOIN _seq_next s;

-- The business signed in for this connection, or NULL when none is set.
-- NULLIF matters: a reset connection reports '' rather than NULL, and ''::uuid is an error.
CREATE FUNCTION app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Hands out the next number of one counter for one business. Row-locked by the upsert,
-- so two invoices saved at the same moment never get the same number.
CREATE FUNCTION next_tenant_number(p_tenant uuid, p_counter text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v bigint;
BEGIN
    IF p_tenant IS NULL THEN
        RAISE EXCEPTION 'A business is required to number a %', p_counter;
    END IF;
    -- A business may only advance its own counters.
    IF app_current_tenant() IS NOT NULL AND p_tenant <> app_current_tenant() THEN
        RAISE EXCEPTION 'Numbering for another business was refused';
    END IF;
    INSERT INTO tenant_counter (tenant_uuid, counter_name, next_value)
    VALUES (p_tenant, p_counter, 100002)
    ON CONFLICT (tenant_uuid, counter_name) DO UPDATE SET next_value = tenant_counter.next_value + 1
    RETURNING next_value - 1 INTO v;
    RETURN v::text;
END $$;

-- Fills a code/number column on insert when the application left it empty.
-- Arguments: the column to fill and the counter to take it from.
CREATE FUNCTION assign_tenant_number() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS NULL THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], next_tenant_number(NEW.tenant_uuid, TG_ARGV[1])));
    END IF;
    RETURN NEW;
END $$;

-- The global sequences are retired: their defaults would fire before the triggers.
ALTER TABLE customer         ALTER COLUMN customer_code         DROP DEFAULT;
ALTER TABLE supplier         ALTER COLUMN supplier_code         DROP DEFAULT;
ALTER TABLE purchase_order   ALTER COLUMN purchase_order_number DROP DEFAULT;
ALTER TABLE sales_order      ALTER COLUMN sales_order_number    DROP DEFAULT;
ALTER TABLE stock_adjustment ALTER COLUMN adjustment_number     DROP DEFAULT;
DROP SEQUENCE customer_code_seq;
DROP SEQUENCE supplier_code_seq;
DROP SEQUENCE purchase_order_number_seq;
DROP SEQUENCE sales_order_number_seq;
DROP SEQUENCE stock_adjustment_number_seq;

CREATE TRIGGER trg_customer_code BEFORE INSERT ON customer
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('customer_code', 'CUSTOMER');
CREATE TRIGGER trg_supplier_code BEFORE INSERT ON supplier
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('supplier_code', 'SUPPLIER');
CREATE TRIGGER trg_purchase_order_number BEFORE INSERT ON purchase_order
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('purchase_order_number', 'PURCHASE_ORDER');
CREATE TRIGGER trg_sales_order_number BEFORE INSERT ON sales_order
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('sales_order_number', 'SALES_ORDER');
CREATE TRIGGER trg_stock_adjustment_number BEFORE INSERT ON stock_adjustment
    FOR EACH ROW EXECUTE FUNCTION assign_tenant_number('adjustment_number', 'STOCK_ADJUSTMENT');

-- ---------- The role business requests run as ----------
-- NOLOGIN: nobody connects as it. The application connects as the database owner and
-- switches to it (SET ROLE) for every request made on behalf of a business. The owner
-- itself bypasses row-level security, which is what migrations, sign-in and the super
-- admin's platform screens need.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
        CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
END $$;
GRANT erp_tenant TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO erp_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_tenant;
-- A business can read its own business record but never change it (status, code, name are the super admin's).
REVOKE INSERT, UPDATE, DELETE ON tenant FROM erp_tenant;
-- Counters change only through next_tenant_number(); the migration log is not business data.
REVOKE ALL ON tenant_counter, schema_migrations FROM erp_tenant;
REVOKE ALL ON FUNCTION next_tenant_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_tenant_number(uuid, text) TO erp_tenant;

-- ---------- Row-level security ----------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'app_user', 'company', 'customer', 'supplier', 'product',
        'stock_balance', 'stock_adjustment', 'stock_ledger',
        'purchase_order', 'purchase_order_line_item', 'purchase_order_payment',
        'sales_order', 'sales_order_line_item', 'sales_order_payment',
        'sms_outbox', 'tenant_counter']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_uuid = app_current_tenant()) '
                       'WITH CHECK (tenant_uuid = app_current_tenant())', t);
    END LOOP;
END $$;

-- A business sees its own record only.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenant FOR SELECT USING (uuid = app_current_tenant());

-- Sign-in tokens have no business column; they follow their user, and app_user is itself
-- filtered, so a business only ever sees the tokens of its own users.
ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refresh_token
    USING (EXISTS (SELECT 1 FROM app_user u WHERE u.uuid = refresh_token.user_uuid))
    WITH CHECK (EXISTS (SELECT 1 FROM app_user u WHERE u.uuid = refresh_token.user_uuid));
ALTER TABLE password_reset_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON password_reset_token
    USING (EXISTS (SELECT 1 FROM app_user u WHERE u.uuid = password_reset_token.user_uuid))
    WITH CHECK (EXISTS (SELECT 1 FROM app_user u WHERE u.uuid = password_reset_token.user_uuid));
