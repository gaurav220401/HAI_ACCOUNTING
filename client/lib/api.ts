import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import {
  isServerUnavailableError,
  isServerUnavailableResponse,
  markServerAvailable,
  markServerUnavailable,
} from "./server-status";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/**
 * Get the current user's Firebase ID token.
 */
async function waitForCurrentUser(timeoutMs = 3000) {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<User | null>((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}

async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser ?? (await waitForCurrentUser());
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Authenticated fetch wrapper — automatically attaches Firebase ID token.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getIdToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
      headers,
    });

    if (!response.ok) {
      const message = await response
        .clone()
        .text()
        .catch(() => "");

      if (isServerUnavailableResponse(response.status, message)) {
        markServerUnavailable(message || `Server responded with ${response.status}`);
      } else if (response.status < 500) {
        markServerAvailable();
      }
    } else {
      markServerAvailable();
    }

    return response;
  } catch (error) {
    if (isServerUnavailableError(error)) {
      markServerUnavailable(error);
    }

    throw error;
  }
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
  }>,
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
  ReminderSettings,
  PortalSettings,
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
  OpeningBalanceAccountRow,
  OpeningBalanceGroup,
  OpeningBalanceSummary,
  OpeningBalanceData,
  SaveOpeningBalanceInput,
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

export { paymentReceivedApi } from "./api/payments-received";
export type {
  PaymentReceived,
  PaymentReceivedStatus,
  PaymentInvoiceMap,
  CreatePaymentReceivedInput,
  UpdatePaymentReceivedInput,
  PaymentReceivedListParams,
} from "./api/payments-received";

export { reportApi } from "./api/reports";
export type {
  TrialBalanceRow,
  TrialBalanceResponse,
  ProfitLossLine,
  ProfitLossResponse,
  BalanceSheetLine,
  BalanceSheetResponse,
  ControlReconciliationResponse,
} from "./api/reports";

export { projectApi } from "./api/projects";
export type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  TimesheetEntry,
  CreateTimesheetEntryInput,
  TimeLog,
} from "./api/projects";

export { fixedAssetApi } from "./api/fixed-assets";
export type {
  FixedAsset,
  FixedAssetStatus,
  FixedAssetType,
  DepreciationMethod,
  DepreciationFrequency,
  AssetLifeUnit,
  ComputationType,
  CreateFixedAssetInput,
  UpdateFixedAssetInput,
  CreateFixedAssetTypeInput,
  UpdateFixedAssetTypeInput,
} from "./api/fixed-assets";
