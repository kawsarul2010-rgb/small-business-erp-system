-- One business, one company. New businesses get their company when they are created (from the
-- business name, code and contact details). This gives the same to every existing business that
-- has no active company yet, so it can start creating orders straight away. Businesses that
-- already have companies keep them as they are.

INSERT INTO company (uuid, tenant_uuid, company_name, company_code, phone_number, email,
                     revision, created_date, updated_date,
                     created_by_user_uuid, updated_by_user_uuid, created_by_user_name, updated_by_user_name, status)
SELECT gen_random_uuid(),
       t.uuid,
       left(t.tenant_name, 150),
       -- Same rule as TenantCodes.CompanyCode: the business code in capitals, at most 20 characters.
       COALESCE(NULLIF(trim(BOTH '-' FROM left(upper(t.tenant_code), 20)), ''), 'MAIN'),
       CASE WHEN t.contact_phone ~ '^88[0-9]{11}$' THEN substr(t.contact_phone, 3) ELSE t.contact_phone END,
       t.contact_email,
       gen_random_uuid(), now(), now(),
       '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'SYSTEM', 'ACTIVE'
FROM tenant t
WHERE NOT EXISTS (SELECT 1 FROM company c WHERE c.tenant_uuid = t.uuid AND c.status = 'ACTIVE')
  -- a deleted company may already use the code; then the business adds its company itself
  AND NOT EXISTS (SELECT 1 FROM company c WHERE c.tenant_uuid = t.uuid
                  AND c.company_code = COALESCE(NULLIF(trim(BOTH '-' FROM left(upper(t.tenant_code), 20)), ''), 'MAIN'));
