-- A single-business database as it looks after 0003 (Sompriti today).
INSERT INTO company (uuid, company_name, company_code) VALUES
 ('c0000000-0000-0000-0000-000000000001','Sompriti Enterprise','SE'),
 ('c0000000-0000-0000-0000-000000000002','Sompriti Traders','ST');
INSERT INTO customer (uuid, customer_name, mobile_number) VALUES
 ('a0000000-0000-0000-0000-000000000001','Karim Traders','8801711000001'),
 ('a0000000-0000-0000-0000-000000000002','Rahman Store','8801711000002'),
 ('a0000000-0000-0000-0000-000000000003','Hasan Mart','8801711000003');
INSERT INTO supplier (uuid, supplier_name, mobile_number) VALUES
 ('b0000000-0000-0000-0000-000000000001','Meghna Distributors','8801811000001');
INSERT INTO product (uuid, product_name, product_code, product_sales_price, product_purchase_price, uom, secondary_uom, unit_per_box) VALUES
 ('d0000000-0000-0000-0000-000000000001','Tamim oil','20c',195,180,'BOX','LITRE',20),
 ('d0000000-0000-0000-0000-000000000002','No-1 oil','10c',195,180,'LITRE',NULL,NULL);
INSERT INTO stock_balance (uuid, product_uuid, current_stock_balance) VALUES
 (gen_random_uuid(),'d0000000-0000-0000-0000-000000000001',400),
 (gen_random_uuid(),'d0000000-0000-0000-0000-000000000002',55.5);
INSERT INTO app_user (uuid, user_name, email, phone_number, password_hash, role, customer_uuid) VALUES
 ('e0000000-0000-0000-0000-000000000001','Kawsar Admin','admin@sompriti.local','8801700000001','x','ADMIN',NULL),
 ('e0000000-0000-0000-0000-000000000002','Karim (portal)','karim@example.com','8801711000001','x','USER','a0000000-0000-0000-0000-000000000001');
INSERT INTO sales_order (uuid, company_uuid, customer_uuid, payment_type, posting_status, order_date, total_amount) VALUES
 ('f0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','CASH','FINAL','2026-09-01',5850),
 ('f0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','DUE','DRAFT','2026-09-02',0);
INSERT INTO sales_order_line_item (uuid, sales_order_uuid, line_number, product_uuid, quantity_type, box_quantity, unit_per_box_snapshot, total_quantity, per_unit_price, per_box_price, total_price) VALUES
 (gen_random_uuid(),'f0000000-0000-0000-0000-000000000001',1,'d0000000-0000-0000-0000-000000000001','BOX',1,20,20,195,3900,3900);
INSERT INTO sales_order_payment (uuid, sales_order_uuid, payment_date, payment_amount, payment_method) VALUES
 (gen_random_uuid(),'f0000000-0000-0000-0000-000000000001','2026-09-01',5850,'CASH');
INSERT INTO purchase_order (uuid, company_uuid, supplier_uuid, payment_type, posting_status, order_date, total_amount) VALUES
 ('90000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','CASH','FINAL','2026-08-20',72000);
INSERT INTO stock_adjustment (uuid, product_uuid, adjustment_type, quantity, reason, adjustment_date) VALUES
 (gen_random_uuid(),'d0000000-0000-0000-0000-000000000002','INCREASE',55.5,'OPENING_STOCK','2026-08-01');
INSERT INTO stock_ledger (uuid, product_uuid, movement_type, quantity_change, balance_after, reference_type, reference_uuid, reference_number, created_by_user_uuid, created_by_user_name)
 VALUES (gen_random_uuid(),'d0000000-0000-0000-0000-000000000001','SALES_FINAL',-20,400,'SALES_ORDER','f0000000-0000-0000-0000-000000000001','100001','00000000-0000-0000-0000-000000000001','seed');
INSERT INTO sms_outbox (uuid, recipient_number, message, reference_type, reference_uuid, status, created_date)
 VALUES (gen_random_uuid(),'8801711000001','Payment received','SALES_ORDER_PAYMENT',gen_random_uuid(),'SENT',now());
INSERT INTO refresh_token (uuid, user_uuid, token_hash, expires_date, created_date)
 VALUES (gen_random_uuid(),'e0000000-0000-0000-0000-000000000001','hash-sompriti-admin',now()+interval '7 days',now());
-- The global sequences had moved on, as they would have in production.
SELECT setval('sales_order_number_seq', 100457), setval('customer_code_seq', 100212);
