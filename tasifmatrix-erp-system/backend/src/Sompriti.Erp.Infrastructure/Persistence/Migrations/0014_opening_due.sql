-- Previous due ("আগের বাকি"): a business that starts using the app can record what a customer
-- already owed it (or what it already owed a supplier) without entering the old orders.
--
-- It is kept as a FINAL order with no line items and is_opening_due = true, so it shows in the
-- order list, the party's due and the due report and is collected with "Add payment" like any
-- other due. It never moves stock and is left out of the sales/purchase totals on the dashboard
-- and out of the monthly order count used for the business size.

ALTER TABLE sales_order    ADD COLUMN is_opening_due boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_order ADD COLUMN is_opening_due boolean NOT NULL DEFAULT false;
