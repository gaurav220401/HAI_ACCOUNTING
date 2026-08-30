import { apiFetch } from "./client";

export type CategorizationMatchType = "upi_vpa" | "counterparty_name";

export interface CategorizationRule {
  _id: string;
  matchType: CategorizationMatchType;
  matchValue: string;
  accountId: string | null;
  accountName: string;
  contactName: string | null;
  timesApplied: number;
  lastAppliedAt: string;
}

export const categorizationRuleApi = {
  /** GET /api/categorization-rules — every learned counterparty→account mapping for this org. */
  list: () =>
    apiFetch<{ success: boolean; data: CategorizationRule[] }>("/categorization-rules"),

  /** PATCH /api/categorization-rules/:id — re-point a learned rule at a different account. */
  update: (id: string, accountId: string) =>
    apiFetch<{ success: boolean; data: { _id: string; accountId: string; accountName: string } }>(
      `/categorization-rules/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ accountId }),
        headers: { "Content-Type": "application/json" },
      },
    ),

  /** DELETE /api/categorization-rules/:id — the counterparty reverts to Suspense until re-taught. */
  remove: (id: string) =>
    apiFetch<{ success: boolean; data: { _id: string } }>(`/categorization-rules/${id}`, {
      method: "DELETE",
    }),
};
