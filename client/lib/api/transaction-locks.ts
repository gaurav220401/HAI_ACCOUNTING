import { apiFetch } from "./client";

export type TransactionLockModule = "Sales" | "Purchases" | "Banking" | "Accountant";

export interface TransactionLock {
  module: TransactionLockModule;
  locked: boolean;
  lockedDate: string | null;
}

export const transactionLockApi = {
  /** GET /api/transaction-locks — always returns all 4 modules. */
  list: () =>
    apiFetch<{ success: boolean; data: TransactionLock[] }>("/transaction-locks"),

  /** PUT /api/transaction-locks/:module — lockedDate is an ISO date string. */
  lock: (module: TransactionLockModule, lockedDate: string) =>
    apiFetch<{ success: boolean; data: TransactionLock }>(
      `/transaction-locks/${module}`,
      {
        method: "PUT",
        body: JSON.stringify({ lockedDate }),
        headers: { "Content-Type": "application/json" },
      },
    ),

  /** DELETE /api/transaction-locks/:module — removes the lock entirely. */
  unlock: (module: TransactionLockModule) =>
    apiFetch<{ success: boolean; data: TransactionLock }>(
      `/transaction-locks/${module}`,
      { method: "DELETE" },
    ),
};
