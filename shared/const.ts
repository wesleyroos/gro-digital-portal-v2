export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Gro Digital company details shown on invoices. Editable in Settings → Company;
// these are the fallback defaults when no override has been saved.
export const DEFAULT_COMPANY_INFO = {
  name: "Gro Digital (Pty) Ltd",
  addressLine1: "Darter Studios, Darter Road, Longkloof",
  addressLine2: "Gardens, Cape Town, 8001",
  email: "hello@grodigital.co.za",
  website: "grodigital.co.za",
};
export type CompanyInfo = typeof DEFAULT_COMPANY_INFO;
