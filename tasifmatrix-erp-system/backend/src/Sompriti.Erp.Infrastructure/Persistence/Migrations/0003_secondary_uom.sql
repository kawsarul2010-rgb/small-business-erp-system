-- ---------------------------------------------------------------------------
-- 0003 - A box can hold any unit, and "pcs" stops meaning "the product's unit".
--
-- Until now a box always held pieces. A box may now hold pieces, kilos or litres:
--
--   uom = BOX, secondary_uom = PCS,   unit_per_box = 12    -> a carton of 12 pieces
--   uom = BOX, secondary_uom = KG,    unit_per_box = 25    -> a 25 kg sack
--   uom = BOX, secondary_uom = LITRE, unit_per_box = 5     -> a 5 litre tin
--
-- secondary_uom is the unit stock is counted in for a BOX product. For every other
-- product stock is counted in its own uom, and unit_per_box is optional - it just
-- allows ordering by the box as pcs_per_box used to.
--
-- The quantity columns are renamed to match: they hold the product's base unit,
-- which is no longer always pieces.
-- ---------------------------------------------------------------------------

-- ---------- product: secondary unit and units per box ----------
ALTER TABLE product ADD COLUMN secondary_uom varchar(5) NULL
    CHECK (secondary_uom IS NULL OR secondary_uom IN ('PCS','KG','LITRE'));
ALTER TABLE product ADD COLUMN unit_per_box numeric(14,3) NULL
    CHECK (unit_per_box IS NULL OR unit_per_box > 0);

-- Everything that had a pcs-per-box was, by definition, a box of pieces.
UPDATE product SET unit_per_box = pcs_per_box WHERE pcs_per_box IS NOT NULL;
UPDATE product SET secondary_uom = 'PCS' WHERE uom = 'BOX';

ALTER TABLE product DROP CONSTRAINT IF EXISTS ck_product_box;
ALTER TABLE product DROP COLUMN pcs_per_box;

-- A BOX product must say what its box holds and how much of it.
ALTER TABLE product ADD CONSTRAINT ck_product_box
    CHECK (uom <> 'BOX' OR (secondary_uom IS NOT NULL AND unit_per_box IS NOT NULL));
-- A secondary unit only means something for a BOX product.
ALTER TABLE product ADD CONSTRAINT ck_product_secondary_uom
    CHECK (secondary_uom IS NULL OR uom = 'BOX');

-- ---------- order lines: "pcs" -> the product's base unit ----------
ALTER TABLE purchase_order_line_item RENAME COLUMN pcs_quantity        TO unit_quantity;
ALTER TABLE purchase_order_line_item RENAME COLUMN total_quantity_pcs  TO total_quantity;
ALTER TABLE purchase_order_line_item RENAME COLUMN per_pcs_price       TO per_unit_price;
ALTER TABLE purchase_order_line_item RENAME COLUMN pcs_per_box_snapshot TO unit_per_box_snapshot;
ALTER TABLE purchase_order_line_item ALTER COLUMN unit_per_box_snapshot TYPE numeric(14,3);

ALTER TABLE sales_order_line_item RENAME COLUMN pcs_quantity        TO unit_quantity;
ALTER TABLE sales_order_line_item RENAME COLUMN total_quantity_pcs  TO total_quantity;
ALTER TABLE sales_order_line_item RENAME COLUMN per_pcs_price       TO per_unit_price;
ALTER TABLE sales_order_line_item RENAME COLUMN pcs_per_box_snapshot TO unit_per_box_snapshot;
ALTER TABLE sales_order_line_item ALTER COLUMN unit_per_box_snapshot TYPE numeric(14,3);

-- ---------- stock adjustments ----------
ALTER TABLE stock_adjustment RENAME COLUMN quantity_pcs TO quantity;
