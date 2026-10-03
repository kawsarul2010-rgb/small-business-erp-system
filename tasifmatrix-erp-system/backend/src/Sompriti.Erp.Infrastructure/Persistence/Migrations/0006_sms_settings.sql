-- SMS switches. A customer or supplier gets an SMS only when all three are on:
--   1. the business allows SMS              business_setting.sms_enabled   (default on)
--   2. the customer / supplier accepts SMS  customer/supplier.sms_enabled  (default on)
--   3. the order asks for SMS               sales/purchase_order.send_sms  (default off; a
--      business can make new orders start with it on: business_setting.sms_on_new_orders)

ALTER TABLE customer ADD COLUMN sms_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE supplier ADD COLUMN sms_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE sales_order ADD COLUMN send_sms boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_order ADD COLUMN send_sms boolean NOT NULL DEFAULT false;

-- A business's own settings, changed by its admins. One row per business, created the first
-- time an admin saves; until then the defaults above apply. (The tenant row itself stays
-- read-only to businesses: it holds what only the super admin may change.)
CREATE TABLE business_setting (
    uuid                  uuid PRIMARY KEY,
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    sms_enabled           boolean NOT NULL DEFAULT true,
    sms_on_new_orders     boolean NOT NULL DEFAULT false,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ux_business_setting_tenant UNIQUE (tenant_uuid)
);

ALTER TABLE business_setting ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business_setting USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON business_setting TO erp_tenant;
