import { auth } from "./firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/**
 * Get the current user's Firebase ID token.
 */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Authenticated fetch wrapper — automatically attaches Firebase ID token.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getIdToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

/**
 * Register user in backend after Firebase auth.
 */
export async function registerUser(data?: {
  name?: string;
  dob?: string;
  gender?: string;
}) {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

/**
 * Get current user profile from backend.
 */
export async function getMe() {
  const res = await apiFetch("/auth/me");
  return res.json();
}

/**
 * Complete user profile (name, dob, gender).
 */
export async function completeProfile(data: {
  name: string;
  dob: string;
  gender: string;
}) {
  const res = await apiFetch("/auth/complete-profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.json();
}

/**
 * Update user profile.
 */
export async function updateProfile(
  data: Partial<{
    name: string;
    dob: string;
    gender: string;
    phone: string;
    photoURL: string;
  }>
) {
  const res = await apiFetch("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.json();
}

// ─── Re-exports from new structured API clients ──────────────────────────

export { organizationApi } from "./api/organizations";
export type {
  Organization,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./api/organizations";

export { accountApi } from "./api/accounts";
export type {
  Account,
  AccountRootType,
  AccountType,
  AssetAccountType,
  LiabilityAccountType,
  IncomeAccountType,
  ExpenseAccountType,
  GroupedAccounts,
  CreateAccountInput,
  UpdateAccountInput,
} from "./api/accounts";

export { contactApi } from "./api/contacts";
export type {
  Contact,
  ContactType,
  TaxTreatment,
  ContactPerson,
  Address as ContactAddress,
  CreateContactInput,
  UpdateContactInput,
  ContactListParams,
} from "./api/contacts";

export { itemApi } from "./api/items";
export type {
  Item,
  ItemType,
  ItemGroup,
  UnitOfMeasurement,
  CreateItemInput,
  UpdateItemInput,
} from "./api/items";

export { currencyApi } from "./api/currencies";
export type { Currency, ExchangeRate } from "./api/currencies";

export { settingsApi } from "./api/settings";
export type {
  Tax,
  TaxType,
  PaymentTerms,
  Warehouse,
  SalesPerson,
  PaymentMode,
  ExpenseCategory,
  ReportingTag,
  PriceList,
} from "./api/settings";
