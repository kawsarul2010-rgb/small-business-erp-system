-- Subscriptions: each business pays for the app with a package (plan) priced by its size.
--
--   business_size            Small / Medium / Large ... - chosen at sign-up, changed by the super admin
--   subscription_plan        Monthly / 3 months / Yearly ... - how long one payment lasts
--   subscription_plan_price  what a plan costs for a size (no row: that plan is not offered to that size)
--   billing_settings         one row: billing on/off, free trial, grace period, reminder, bKash account
--   billing_payment          every payment attempt of every business (bKash or recorded by hand)
--   tenant.*                 each business's one subscription: its size, plan, paid-until date
--
-- Billing starts switched OFF, so nothing changes for anyone until the super admin turns it on.
-- Only the database owner (sign-in, payment callbacks, the super admin) writes these tables;
-- businesses read the packages and their own payments.

CREATE TABLE business_size (
    uuid                  uuid PRIMARY KEY,
    size_name             varchar(60)  NOT NULL,
    description           varchar(300) NULL,
    sort_order            integer      NOT NULL DEFAULT 0,
    is_active             boolean      NOT NULL DEFAULT true,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL
);

CREATE TABLE subscription_plan (
    uuid                  uuid PRIMARY KEY,
    plan_name             varchar(60)  NOT NULL,
    description           varchar(300) NULL,
    duration_months       integer      NOT NULL CHECK (duration_months BETWEEN 1 AND 60),
    sort_order            integer      NOT NULL DEFAULT 0,
    is_active             boolean      NOT NULL DEFAULT true,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL
);

CREATE TABLE subscription_plan_price (
    plan_uuid  uuid NOT NULL REFERENCES subscription_plan (uuid) ON DELETE CASCADE,
    size_uuid  uuid NOT NULL REFERENCES business_size (uuid) ON DELETE CASCADE,
    price      numeric(12, 2) NOT NULL CHECK (price >= 0),
    PRIMARY KEY (plan_uuid, size_uuid)
);

CREATE TABLE billing_settings (
    id                    integer PRIMARY KEY CHECK (id = 1),
    billing_enabled       boolean NOT NULL DEFAULT false,
    trial_days            integer NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 0 AND 365),
    grace_days            integer NOT NULL DEFAULT 7  CHECK (grace_days BETWEEN 0 AND 60),
    reminder_days         integer NOT NULL DEFAULT 7  CHECK (reminder_days BETWEEN 0 AND 60),
    support_phone         varchar(30)  NULL,
    support_email         varchar(200) NULL,
    bkash_enabled         boolean NOT NULL DEFAULT false,
    bkash_sandbox         boolean NOT NULL DEFAULT true,
    bkash_app_key         varchar(200) NULL,
    -- secrets are stored encrypted by the application (never in plain text)
    bkash_app_secret      text NULL,
    bkash_username        varchar(200) NULL,
    bkash_password        text NULL,
    updated_date          timestamptz NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL
);
INSERT INTO billing_settings (id, updated_date, updated_by_user_name) VALUES (1, now(), 'SYSTEM');

CREATE TABLE billing_payment (
    uuid                  uuid PRIMARY KEY,
    tenant_uuid           uuid NOT NULL REFERENCES tenant (uuid) ON DELETE RESTRICT,
    plan_uuid             uuid NULL REFERENCES subscription_plan (uuid) ON DELETE SET NULL,
    -- what was bought, as it was at the time (names and prices can change later)
    plan_name             varchar(60)  NOT NULL,
    size_name             varchar(60)  NULL,
    duration_months       integer      NOT NULL CHECK (duration_months BETWEEN 0 AND 60),
    amount                numeric(12, 2) NOT NULL CHECK (amount >= 0),
    provider              varchar(10)  NOT NULL CHECK (provider IN ('BKASH','MANUAL')),
    status                varchar(10)  NOT NULL CHECK (status IN ('INITIATED','COMPLETED','FAILED','CANCELLED')),
    invoice_number        varchar(40)  NOT NULL,
    provider_payment_id   varchar(100) NULL,
    trx_id                varchar(60)  NULL,
    payer_account         varchar(30)  NULL,
    status_message        varchar(300) NULL,
    note                  varchar(300) NULL,
    period_start          timestamptz NULL,
    period_end            timestamptz NULL,
    created_date          timestamptz NOT NULL,
    completed_date        timestamptz NULL,
    created_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ux_billing_payment_invoice UNIQUE (invoice_number),
    CONSTRAINT ux_billing_payment_provider_id UNIQUE (provider_payment_id)
);
CREATE INDEX ix_billing_payment_tenant ON billing_payment (tenant_uuid, created_date DESC);

ALTER TABLE billing_payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_payment USING (tenant_uuid = app_current_tenant())
    WITH CHECK (tenant_uuid = app_current_tenant());

ALTER TABLE tenant ADD COLUMN business_size_uuid     uuid NULL REFERENCES business_size (uuid) ON DELETE SET NULL;
ALTER TABLE tenant ADD COLUMN subscription_plan_uuid uuid NULL REFERENCES subscription_plan (uuid) ON DELETE SET NULL;
-- paid (or trial) until; NULL while billing has never been switched on for this business
ALTER TABLE tenant ADD COLUMN subscription_ends_at   timestamptz NULL;
ALTER TABLE tenant ADD COLUMN on_trial               boolean NOT NULL DEFAULT false;
-- never billed (e.g. the platform owner's own or a partner business)
ALTER TABLE tenant ADD COLUMN billing_exempt         boolean NOT NULL DEFAULT false;

-- Businesses only read packages and their own payments; the settings (with the bKash account) not at all.
REVOKE INSERT, UPDATE, DELETE ON business_size, subscription_plan, subscription_plan_price FROM erp_tenant;
REVOKE ALL ON billing_settings FROM erp_tenant;
REVOKE INSERT, UPDATE, DELETE ON billing_payment FROM erp_tenant;

-- A starting point the super admin edits: three sizes and three packages, with no prices yet
-- (a package without a price for a size is simply not offered to that size).
INSERT INTO business_size (uuid, size_name, description, sort_order, revision, created_date, updated_date,
                           created_by_user_uuid, updated_by_user_uuid, created_by_user_name, updated_by_user_name)
VALUES
  (gen_random_uuid(), 'Small',  'A shop or a small trader',          1, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'),
  (gen_random_uuid(), 'Medium', 'A growing business with some staff', 2, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'),
  (gen_random_uuid(), 'Large',  'A distributor or a large business',  3, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM');

INSERT INTO subscription_plan (uuid, plan_name, description, duration_months, sort_order, revision, created_date, updated_date,
                               created_by_user_uuid, updated_by_user_uuid, created_by_user_name, updated_by_user_name)
VALUES
  (gen_random_uuid(), 'Monthly',  'Pay every month',      1,  1, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'),
  (gen_random_uuid(), '3 months', 'Pay every three months', 3,  2, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM'),
  (gen_random_uuid(), 'Yearly',   'Pay once a year',      12, 3, gen_random_uuid(), now(), now(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM');
