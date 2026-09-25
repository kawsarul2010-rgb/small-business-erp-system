-- ---------------------------------------------------------------------------
-- 0002 - KG and LITRE units, and fractional quantities.
--
-- Products can now be measured in KG and LITRE as well as PCS and BOX. Weight and
-- volume are not whole numbers, so every quantity column becomes numeric(14,3):
-- three decimal places, which covers grams and millilitres.
--
-- Existing integer quantities convert exactly - 12 becomes 12.000 - so no data is
-- lost and no row needs rewriting by hand.
-- ---------------------------------------------------------------------------

-- ---------- Units ----------
-- 'LITRE' is five characters, so the columns holding unit codes have to widen.

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_uom_check;
ALTER TABLE product ALTER COLUMN uom TYPE varchar(5);
ALTER TABLE product ADD CONSTRAINT product_uom_check CHECK (uom IN ('PCS','BOX','KG','LITRE'));

ALTER TABLE purchase_order_line_item DROP CONSTRAINT IF EXISTS purchase_order_line_item_quantity_type_check;
ALTER TABLE purchase_order_line_item ALTER COLUMN quantity_type TYPE varchar(5);
ALTER TABLE purchase_order_line_item ADD CONSTRAINT purchase_order_line_item_quantity_type_check
    CHECK (quantity_type IN ('PCS','BOX','KG','LITRE'));

ALTER TABLE sales_order_line_item DROP CONSTRAINT IF EXISTS sales_order_line_item_quantity_type_check;
ALTER TABLE sales_order_line_item ALTER COLUMN quantity_type TYPE varchar(5);
ALTER TABLE sales_order_line_item ADD CONSTRAINT sales_order_line_item_quantity_type_check
    CHECK (quantity_type IN ('PCS','BOX','KG','LITRE'));

-- ---------- Fractional quantities ----------
-- box_quantity, pcs_per_box and pcs_per_box_snapshot stay integer: a box is always whole.

ALTER TABLE purchase_order_line_item
    ALTER COLUMN pcs_quantity       TYPE numeric(14,3),
    ALTER COLUMN total_quantity_pcs TYPE numeric(14,3);

ALTER TABLE sales_order_line_item
    ALTER COLUMN pcs_quantity       TYPE numeric(14,3),
    ALTER COLUMN total_quantity_pcs TYPE numeric(14,3);

ALTER TABLE stock_balance
    ALTER COLUMN current_stock_balance TYPE numeric(14,3);

ALTER TABLE stock_adjustment
    ALTER COLUMN quantity_pcs TYPE numeric(14,3);

ALTER TABLE stock_ledger
    ALTER COLUMN quantity_change TYPE numeric(14,3),
    ALTER COLUMN balance_after   TYPE numeric(14,3);

-- A low stock threshold has to be comparable with the balance, so it follows.
ALTER TABLE product
    ALTER COLUMN low_stock_threshold TYPE numeric(14,3);
