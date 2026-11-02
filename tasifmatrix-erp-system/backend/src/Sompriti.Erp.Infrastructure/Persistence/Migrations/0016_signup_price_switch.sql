-- The super admin can hide the package prices on the sign-up page (on by default, as before).
-- Off: a new business sees only the free trial when it registers; prices are still on the
-- Billing page after sign-up.

ALTER TABLE billing_settings ADD COLUMN show_prices_on_signup boolean NOT NULL DEFAULT true;
