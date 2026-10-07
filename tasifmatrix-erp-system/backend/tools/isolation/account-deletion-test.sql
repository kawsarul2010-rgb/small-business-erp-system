-- Account deletion checks for tools/isolation/run.sh: runs after every migration, on the data the
-- isolation checks leave behind (business A = 'main', business B = 'rahim-store').
\set ON_ERROR_STOP 1
\pset tuples_only on
RESET ROLE;
CREATE FUNCTION pg_temp.check(ok boolean, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ok THEN RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: ' || label; END IF;
  RETURN 'PASS  ' || label;
END $$;

SELECT set_config('test.a', (SELECT uuid::text FROM tenant WHERE tenant_code = 'main'), false);
SELECT set_config('test.b', 'bbbbbbbb-0000-0000-0000-000000000000', false);
-- A's admin creates an order and a payment; a staff member signs in.
SELECT set_config('test.admin', (SELECT uuid::text FROM app_user WHERE tenant_uuid = current_setting('test.a')::uuid AND role = 'ADMIN' LIMIT 1), false);
INSERT INTO app_user (uuid, tenant_uuid, user_name, email, phone_number, password_hash, role)
     VALUES ('aaaaaaaa-0000-0000-0000-00000000e777', current_setting('test.a')::uuid, 'Rina Staff', 'rina@example.com', '8801700000777', 'x', 'MANAGER');
UPDATE sales_order SET created_by_user_uuid = 'aaaaaaaa-0000-0000-0000-00000000e777', created_by_user_name = 'Rina Staff'
 WHERE uuid = (SELECT uuid FROM sales_order WHERE tenant_uuid = current_setting('test.a')::uuid ORDER BY created_date LIMIT 1);
INSERT INTO refresh_token (uuid, user_uuid, token_hash, expires_date, created_date)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000e777', 'hash-rina', now() + interval '7 days', now());

-- ------------------------------------------------------------------ one person deletes their account
SELECT app_forget_user('aaaaaaaa-0000-0000-0000-00000000e777');
SELECT pg_temp.check((SELECT status = 'DELETED' AND user_name = 'Deleted user' AND email LIKE 'deleted-%@deleted.invalid'
                             AND phone_number = '' AND password_hash = '!deleted'
                      FROM app_user WHERE uuid = 'aaaaaaaa-0000-0000-0000-00000000e777'), 'a deleted account keeps no name, email, phone or password');
SELECT pg_temp.check((SELECT count(*) FROM refresh_token WHERE user_uuid = 'aaaaaaaa-0000-0000-0000-00000000e777') = 0, 'its sessions are ended');
SELECT pg_temp.check((SELECT count(*) FROM sales_order WHERE created_by_user_name = 'Rina Staff') = 0
                 AND (SELECT count(*) FROM sales_order WHERE created_by_user_uuid = 'aaaaaaaa-0000-0000-0000-00000000e777' AND created_by_user_name = 'Deleted user') = 1,
       'its name is removed from the orders it created, which stay with the business');
INSERT INTO app_user (uuid, tenant_uuid, user_name, email, phone_number, password_hash, role)
     VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'Rina Again', 'rina@example.com', '8801700000778', 'x', 'USER');
SELECT pg_temp.check(true, 'the email can be used again for a new account');

-- ------------------------------------------------------------------ the last admin closes business A
INSERT INTO billing_payment (uuid, tenant_uuid, plan_name, duration_months, amount, provider, status, invoice_number, trx_id)
     VALUES (gen_random_uuid(), current_setting('test.a')::uuid, 'Monthly', 1, 100, 'BKASH', 'COMPLETED', 'TM261007-TEST01', 'TRX1');
SELECT set_config('test.a_payments', (SELECT count(*)::text FROM billing_payment WHERE tenant_uuid = current_setting('test.a')::uuid), false);
SELECT set_config('test.b_orders', (SELECT count(*)::text FROM sales_order WHERE tenant_uuid = current_setting('test.b')::uuid), false);
SELECT app_close_business(current_setting('test.a')::uuid);
SELECT pg_temp.check((SELECT status = 'CLOSED' AND closed_date IS NOT NULL AND contact_email IS NULL AND contact_phone IS NULL
                      FROM tenant WHERE uuid = current_setting('test.a')::uuid), 'the business is closed and its contact details erased');
SELECT pg_temp.check((SELECT count(*) FROM sales_order WHERE tenant_uuid = current_setting('test.a')::uuid) = 0
                 AND (SELECT count(*) FROM customer WHERE tenant_uuid = current_setting('test.a')::uuid) = 0
                 AND (SELECT count(*) FROM product WHERE tenant_uuid = current_setting('test.a')::uuid) = 0
                 AND (SELECT count(*) FROM stock_ledger WHERE tenant_uuid = current_setting('test.a')::uuid) = 0
                 AND (SELECT count(*) FROM sms_outbox WHERE tenant_uuid = current_setting('test.a')::uuid) = 0
                 AND (SELECT count(*) FROM company WHERE tenant_uuid = current_setting('test.a')::uuid) = 0, 'every business record is deleted');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM app_user WHERE tenant_uuid = current_setting('test.a')::uuid
                                   AND (status <> 'DELETED' OR user_name <> 'Deleted user' OR email NOT LIKE '%@deleted.invalid')),
       'every account of the business is erased');
SELECT pg_temp.check((SELECT count(*) FROM refresh_token r JOIN app_user u ON u.uuid = r.user_uuid WHERE u.tenant_uuid = current_setting('test.a')::uuid) = 0,
       'every session of the business is ended');
SELECT pg_temp.check((SELECT count(*)::text FROM billing_payment WHERE tenant_uuid = current_setting('test.a')::uuid) = current_setting('test.a_payments')
                 AND current_setting('test.a_payments') <> '0',
       'subscription payments are kept as accounting records');
SELECT pg_temp.check((SELECT count(*)::text FROM sales_order WHERE tenant_uuid = current_setting('test.b')::uuid) = current_setting('test.b_orders')
                 AND (SELECT status FROM tenant WHERE uuid = current_setting('test.b')::uuid) = 'ACTIVE'
                 AND (SELECT user_name FROM app_user WHERE uuid = 'bbbbbbbb-0000-0000-0000-00000000e001') = 'Rahim',
       'another business is untouched');

-- ------------------------------------------------------------------ only the owner may run them
SET ROLE erp_tenant;
SELECT set_config('app.tenant_id', current_setting('test.b'), false);
DO $$ BEGIN
  PERFORM app_close_business(current_setting('test.b')::uuid);
  RAISE EXCEPTION USING ERRCODE = 'T0001', MESSAGE = 'FAIL: a business could close itself without the app';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT pg_temp.check(true, 'a business connection cannot run the deletion functions');
RESET ROLE;
