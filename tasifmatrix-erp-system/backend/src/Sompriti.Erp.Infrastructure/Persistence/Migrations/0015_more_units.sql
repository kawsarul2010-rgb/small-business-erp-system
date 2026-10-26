-- ---------------------------------------------------------------------------
-- 0015 - More units of measure: DOZEN, PACKET, TIN, JAR and DRUM.
--
-- They are counted like PCS (whole numbers only); only KG and LITRE carry fractions.
-- Any of them can be a product's own unit or what its box holds (a carton of 12 jars).
-- 'PACKET' is six characters, so the unit columns widen from varchar(5).
-- ---------------------------------------------------------------------------

ALTER TABLE product DROP CONSTRAINT IF EXISTS product_uom_check;
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_secondary_uom_check;
ALTER TABLE product ALTER COLUMN uom TYPE varchar(10);
ALTER TABLE product ALTER COLUMN secondary_uom TYPE varchar(10);
ALTER TABLE product ADD CONSTRAINT product_uom_check
    CHECK (uom IN ('PCS','BOX','KG','LITRE','DOZEN','PACKET','TIN','JAR','DRUM'));
ALTER TABLE product ADD CONSTRAINT product_secondary_uom_check
    CHECK (secondary_uom IS NULL OR secondary_uom IN ('PCS','KG','LITRE','DOZEN','PACKET','TIN','JAR','DRUM'));

ALTER TABLE purchase_order_line_item DROP CONSTRAINT IF EXISTS purchase_order_line_item_quantity_type_check;
ALTER TABLE purchase_order_line_item ALTER COLUMN quantity_type TYPE varchar(10);
ALTER TABLE purchase_order_line_item ADD CONSTRAINT purchase_order_line_item_quantity_type_check
    CHECK (quantity_type IN ('PCS','BOX','KG','LITRE','DOZEN','PACKET','TIN','JAR','DRUM'));

ALTER TABLE sales_order_line_item DROP CONSTRAINT IF EXISTS sales_order_line_item_quantity_type_check;
ALTER TABLE sales_order_line_item ALTER COLUMN quantity_type TYPE varchar(10);
ALTER TABLE sales_order_line_item ADD CONSTRAINT sales_order_line_item_quantity_type_check
    CHECK (quantity_type IN ('PCS','BOX','KG','LITRE','DOZEN','PACKET','TIN','JAR','DRUM'));
