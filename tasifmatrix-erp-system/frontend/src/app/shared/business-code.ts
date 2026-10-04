/** Same rule as the server (TenantCodes) and the database constraint ck_tenant_code. */
export const BUSINESS_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** "Rahim Store & Co." -> "rahim-store-co", as the server suggests it. */
export function suggestBusinessCode(name: string): string {
  let code = '';
  for (const c of name.trim().toLowerCase()) {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) code += c;
    else if (code.length > 0 && !code.endsWith('-')) code += '-';
  }
  code = code.replace(/^-+|-+$/g, '');
  if (code.length > 30) code = code.slice(0, 30).replace(/-+$/, '');
  return code;
}
