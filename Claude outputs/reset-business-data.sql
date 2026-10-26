-- =====================================================================================
-- Tasif Matrix: empty one business's data, keep the business itself.
--
-- DELETES (for the business code below only):
--   sales orders, purchase orders (with their lines and payments), products,
--   stock (balances, ledger, adjustments), customers, suppliers, SMS history.
-- KEEPS:
--   the business, its company details, settings, users and logins, subscription,
--   bKash payment history and SMS balance (bought SMS stay usable).
-- Numbering (customer codes, order numbers) starts again from 100001.
--
-- It runs as one transaction: if anything fails, nothing is deleted.
-- THIS CANNOT BE UNDONE. Make a database backup first.
-- =====================================================================================
BEGIN;

DO $$
DECLARE
    v_code   text := 'sompriti-enterprise';   -- <<< the business code to empty
    v_tenant uuid;
    v_name   text;
BEGIN
    SELECT uuid, tenant_name INTO v_tenant, v_name FROM tenant WHERE tenant_code = v_code;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No business with code %', v_code;
    END IF;
    RAISE NOTICE 'Emptying business % (%), %', v_name, v_code, v_tenant;

    -- logins that belong to a customer or supplier stay, but are no longer linked to one
    UPDATE app_user SET customer_uuid = NULL, supplier_uuid = NULL WHERE tenant_uuid = v_tenant;

    DELETE FROM sales_order_payment      WHERE tenant_uuid = v_tenant;
    DELETE FROM sales_order_line_item    WHERE tenant_uuid = v_tenant;
    DELETE FROM sales_order              WHERE tenant_uuid = v_tenant;
    DELETE FROM purchase_order_payment   WHERE tenant_uuid = v_tenant;
    DELETE FROM purchase_order_line_item WHERE tenant_uuid = v_tenant;
    DELETE FROM purchase_order           WHERE tenant_uuid = v_tenant;
    DELETE FROM stock_ledger             WHERE tenant_uuid = v_tenant;
    DELETE FROM stock_adjustment         WHERE tenant_uuid = v_tenant;
    DELETE FROM stock_balance            WHERE tenant_uuid = v_tenant;
    DELETE FROM product                  WHERE tenant_uuid = v_tenant;
    DELETE FROM sms_outbox               WHERE tenant_uuid = v_tenant;
    DELETE FROM customer                 WHERE tenant_uuid = v_tenant;
    DELETE FROM supplier                 WHERE tenant_uuid = v_tenant;

    -- numbering starts again at 100001 (delete this line to keep counting on)
    DELETE FROM tenant_counter           WHERE tenant_uuid = v_tenant;
END $$;

-- What is left for this business (all should be 0):
SELECT 'sales orders' AS what, count(*) FROM sales_order s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'purchase orders', count(*) FROM purchase_order s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'products', count(*) FROM product s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'stock rows', count(*) FROM stock_ledger s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'customers', count(*) FROM customer s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'suppliers', count(*) FROM supplier s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise'
UNION ALL SELECT 'SMS history', count(*) FROM sms_outbox s JOIN tenant t ON t.uuid = s.tenant_uuid WHERE t.tenant_code = 'sompriti-enterprise';

COMMIT;
