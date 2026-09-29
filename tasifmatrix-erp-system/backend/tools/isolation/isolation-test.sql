-- Isolation checks for tools/isolation/run.sh (see there). Assumes the single-business seed and migration 0004.
\set ON_ERROR_STOP 1
\pset tuples_only on
-- ================================================================== setup (as the owner)
-- Business A is the upgraded Sompriti data; business B is a second, unrelated business.
SELECT set_config('test.a', (SELECT uuid::text FROM tenant WHERE tenant_code = 'main'), false);
INSERT INTO tenant (uuid, tenant_code, tenant_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', 'rahim-store', 'Rahim Store');
INSERT INTO company  (uuid, tenant_uuid, company_name, company_code) VALUES ('bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Rahim Store', 'SE');
INSERT INTO customer (uuid, tenant_uuid, customer_name, mobile_number) VALUES ('bbbbbbbb-0000-0000-0000-00000000a001', 'bbbbbbbb-0000-0000-0000-000000000000', 'B customer', '8801900000001');
INSERT INTO product  (uuid, tenant_uuid, product_name, product_code, product_sales_price, product_purchase_price, uom)
     VALUES ('bbbbbbbb-0000-0000-0000-00000000d001', 'bbbbbbbb-0000-0000-0000-000000000000', 'B product', '20c', 10, 8, 'PCS');
INSERT INTO sales_order (uuid, tenant_uuid, company_uuid, customer_uuid, payment_type, order_date)
     VALUES ('bbbbbbbb-0000-0000-0000-00000000f001', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-00000000a001', 'CASH', '2026-09-10');
INSERT INTO app_user (uuid, tenant_uuid, user_name, email, phone_number, password_hash, role)
     VALUES ('bbbbbbbb-0000-0000-0000-00000000e001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Rahim', 'rahim@example.com', '8801900000009', 'x', 'ADMIN');
INSERT INTO refresh_token (uuid, user_uuid, token_hash, expires_date, created_date)
     VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-00000000e001', 'hash-rahim', now() + interval '7 days', now());

CREATE FUNCTION pg_temp.check(ok boolean, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ok THEN RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: ' || label; END IF;
  RETURN 'PASS  ' || label;
END $$;

SELECT pg_temp.check((SELECT customer_code FROM customer WHERE tenant_uuid = 'bbbbbbbb-0000-0000-0000-000000000000') = '100001',
       'a new business''s first customer is 100001, not the next global number');
SELECT pg_temp.check((SELECT count(*) FROM product WHERE product_code = '20c') = 2,
       'two businesses can both use product code 20c');
SELECT pg_temp.check((SELECT count(*) FROM company WHERE company_code = 'SE') = 2,
       'two businesses can both use company code SE');

-- ================================================================== as business A
SET ROLE erp_tenant;
SELECT set_config('app.tenant_id', current_setting('test.a'), false);

SELECT pg_temp.check((SELECT count(*) FROM company)  = 2, 'A sees its own 2 companies and not B''s');
SELECT pg_temp.check((SELECT count(*) FROM customer) = 3, 'A sees its own 3 customers');
SELECT pg_temp.check((SELECT count(*) FROM product)  = 2, 'A sees its own 2 products');
SELECT pg_temp.check((SELECT count(*) FROM sales_order) = 2, 'A sees its own 2 sales orders');
SELECT pg_temp.check((SELECT count(*) FROM sales_order WHERE uuid = 'bbbbbbbb-0000-0000-0000-00000000f001') = 0,
       'A cannot read B''s order even by its exact id');
SELECT pg_temp.check((SELECT count(*) FROM app_user) = 2, 'A sees only its own users');
SELECT pg_temp.check((SELECT count(*) FROM refresh_token) = 1, 'A sees only its own users'' sign-in tokens');
SELECT pg_temp.check((SELECT count(*) FROM tenant) = 1 AND (SELECT tenant_code FROM tenant) = 'main', 'A sees only its own business record');
SELECT pg_temp.check((SELECT count(*) FROM sales_order_line_item) = 1 AND (SELECT count(*) FROM stock_ledger) = 1
       AND (SELECT count(*) FROM sms_outbox) = 1 AND (SELECT count(*) FROM stock_balance) = 2, 'child tables are filtered too');

-- Inserting: numbering continues where the old sequence stopped, and RETURNING gives the number back (EF relies on it).
WITH n AS (INSERT INTO customer (uuid, tenant_uuid, customer_name, mobile_number)
                                 VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'New A customer', '8801711000009')
                                 RETURNING customer_code) SELECT pg_temp.check((SELECT customer_code FROM n) = '100213', 'A''s next customer continues its own sequence (100213) and is returned by RETURNING');
WITH n AS (INSERT INTO sales_order (uuid, tenant_uuid, company_uuid, customer_uuid, payment_type, order_date)
                                 VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'c0000000-0000-0000-0000-000000000001',
                                         'a0000000-0000-0000-0000-000000000001', 'CASH', '2026-09-20')
                                 RETURNING sales_order_number) SELECT pg_temp.check((SELECT sales_order_number FROM n) = '100458', 'A''s next invoice is 100458');

-- The row lock the order and stock services take still works under row-level security.
SELECT pg_temp.check((SELECT count(*) FROM (SELECT * FROM stock_balance
                      WHERE product_uuid = ANY(ARRAY['d0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000d001']::uuid[])
                        AND tenant_uuid = current_setting('test.a')::uuid ORDER BY product_uuid FOR UPDATE) x) = 1,
       'SELECT ... FOR UPDATE locks only A''s rows');

-- Things that must be refused
DO $$ BEGIN
  INSERT INTO customer (uuid, tenant_uuid, customer_name, mobile_number) VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000000', 'Planted', '8801700000000');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A inserted a row into B';
EXCEPTION WHEN insufficient_privilege OR raise_exception THEN RAISE NOTICE 'PASS  A cannot insert a customer belonging to B (refused: %)', SQLERRM;
END $$;
DO $$ BEGIN
  -- No numbering trigger on product, so this one reaches the row-level security check itself.
  INSERT INTO product (uuid, tenant_uuid, product_name, product_code, product_sales_price, product_purchase_price, uom)
  VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000000', 'Planted', 'X1', 1, 1, 'PCS');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A inserted a product into B';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  A cannot insert a product belonging to B (refused: %)', SQLERRM;
END $$;
DO $$ BEGIN
  UPDATE customer SET tenant_uuid = 'bbbbbbbb-0000-0000-0000-000000000000' WHERE uuid = 'a0000000-0000-0000-0000-000000000003';
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A moved a row into B';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  A cannot move its row into B';
END $$;
DO $$ DECLARE n int; BEGIN
  UPDATE customer SET customer_name = 'hijacked' WHERE uuid = 'bbbbbbbb-0000-0000-0000-00000000a001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A updated B''s customer'; END IF;
  DELETE FROM customer WHERE uuid = 'bbbbbbbb-0000-0000-0000-00000000a001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A deleted B''s customer'; END IF;
  RAISE NOTICE 'PASS  A''s UPDATE/DELETE aimed at B''s rows touch nothing';
END $$;
DO $$ BEGIN
  -- A's own order line pointing at B's product: the id is real, but it belongs to another business.
  INSERT INTO sales_order_line_item (uuid, tenant_uuid, sales_order_uuid, line_number, product_uuid, quantity_type, unit_quantity, total_quantity, per_unit_price, total_price)
  VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'f0000000-0000-0000-0000-000000000002', 1, 'bbbbbbbb-0000-0000-0000-00000000d001', 'PCS', 1, 1, 10, 10);
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A referenced B''s product';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS  A cannot put B''s product on its own order';
END $$;
DO $$ BEGIN
  INSERT INTO sales_order (uuid, tenant_uuid, company_uuid, customer_uuid, payment_type, order_date)
  VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'c0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000a001', 'CASH', '2026-09-20');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A invoiced B''s customer';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS  A cannot invoice B''s customer';
END $$;
DO $$ BEGIN
  PERFORM next_tenant_number('bbbbbbbb-0000-0000-0000-000000000000', 'SALES_ORDER');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A advanced B''s counter';
EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS  A cannot advance B''s invoice counter';
END $$;
DO $$ BEGIN
  UPDATE tenant SET status = 'ACTIVE';
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A changed its business record';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  A cannot change its own business record (e.g. lift a suspension)';
END $$;
DO $$ BEGIN
  PERFORM * FROM tenant_counter;
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A read the counters table';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS  A cannot read or edit counters directly';
END $$;
DO $$ BEGIN
  INSERT INTO app_user (uuid, tenant_uuid, user_name, email, phone_number, password_hash, role)
  VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'Sneaky', 'sneaky@example.com', '8801700000002', 'x', 'SUPER_ADMIN');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: A created a super admin';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS  a business cannot create a super admin';
END $$;

-- No business set (a request that forgot, or a reset connection) sees nothing at all.
SELECT set_config('app.tenant_id', '', false);
SELECT pg_temp.check((SELECT count(*) FROM customer) + (SELECT count(*) FROM sales_order) + (SELECT count(*) FROM app_user)
                     + (SELECT count(*) FROM tenant) = 0, 'with no business set, every table is empty');

-- ================================================================== as business B
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000000', false);
SELECT pg_temp.check((SELECT count(*) FROM customer) = 1 AND (SELECT count(*) FROM product) = 1, 'B sees only its own data');
WITH n AS (INSERT INTO sales_order (uuid, tenant_uuid, company_uuid, customer_uuid, payment_type, order_date)
                                 VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000c001',
                                         'bbbbbbbb-0000-0000-0000-00000000a001', 'CASH', '2026-09-20')
                                 RETURNING sales_order_number) SELECT pg_temp.check((SELECT sales_order_number FROM n) = '100002', 'B''s invoices are numbered independently of A''s (100002)');

-- ================================================================== back to the owner (platform / sign-in)
RESET ROLE;
SELECT pg_temp.check((SELECT count(*) FROM tenant) = 2 AND (SELECT count(*) FROM customer) = 5,
       'the owner connection (sign-in, platform screens) sees every business');
DO $$ BEGIN
  INSERT INTO app_user (uuid, tenant_uuid, user_name, email, phone_number, password_hash, role)
  VALUES (gen_random_uuid(), NULL, 'Orphan', 'orphan@example.com', '8801700000003', 'x', 'ADMIN');
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: an admin without a business was accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS  every non-super-admin user must belong to a business';
END $$;
SELECT pg_temp.check((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_uuid' AND NOT a.attisdropped
                      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity) = 0,
       'every table with tenant_uuid has row-level security on');
