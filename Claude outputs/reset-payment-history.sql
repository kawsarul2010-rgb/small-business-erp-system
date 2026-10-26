-- =====================================================================================
-- Tasif Matrix: delete the Billing page's payment history of one business.
--
-- DELETES: every subscription / SMS payment of the business (Completed, Failed, Cancelled
--          and Initiated), so "Payment history" on Billing is empty.
-- KEEPS:   the paid-until date of the subscription and the SMS balance - packs bought with a
--          deleted payment stay, they are just no longer linked to it.
--
-- It runs as one transaction: if anything fails, nothing is deleted.
-- THIS CANNOT BE UNDONE. Make a database backup first.
-- =====================================================================================
BEGIN;

DO $$
DECLARE
    v_code    text := 'sompriti-enterprise';   -- <<< the business code
    v_tenant  uuid;
    v_deleted int;
BEGIN
    SELECT uuid INTO v_tenant FROM tenant WHERE tenant_code = v_code;
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'No business with code %', v_code;
    END IF;

    DELETE FROM billing_payment WHERE tenant_uuid = v_tenant;   -- SMS packs keep their SMS (link set to empty)
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE '% payments deleted for %', v_deleted, v_code;
END $$;

-- Left for this business (should be 0):
SELECT count(*) AS payments_left
FROM billing_payment p JOIN tenant t ON t.uuid = p.tenant_uuid
WHERE t.tenant_code = 'sompriti-enterprise';

COMMIT;
