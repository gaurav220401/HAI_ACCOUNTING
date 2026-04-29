import { apiFetch } from "./client";

export interface PutawayLineItem {
  itemId: string;
  name: string;
  quantityReceived: number;
  quantityPutaway: number;
  remainingQuantity: number;
  warehouseId?: string;
}

export interface Putaway {
  _id: string;
  putawayNumber: string;
  purchaseReceiveId: string;
  purchaseReceiveNumber: string;
  date: string;
  warehouseId: string | any;
  status: "Draft" | "Completed" | "Cancelled";
  lineItems: PutawayLineItem[];
  notes: string;
  createdAt: string;
}

export const putawayApi = {
  list: (params: { page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiFetch<{ data: Putaway[]; pagination: any }>(`/putaways${q ? `?${q}` : ""}`);
  },

  getNextNumber: () =>
    apiFetch<{ data: { putawayNumber: string } }>("/putaways/next-number"),

  getPending: () =>
    apiFetch<{ data: any[] }>("/putaways/pending"),

  create: (data: Partial<Putaway>) =>
    apiFetch<{ data: Putaway }>("/putaways", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
