import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type MoveOrderStatus = "Draft" | "Sent" | "In Transit" | "Received" | "Cancelled";

export interface MoveOrderLine {
  itemId: string | { _id: string; name: string; sku?: string };
  quantity: number;
}

export interface MoveOrder {
  _id: string;
  organizationId: string;
  orderNumber: string;
  date: string;
  fromWarehouseId: string | { _id: string; name: string };
  toWarehouseId: string | { _id: string; name: string };
  status: MoveOrderStatus;
  items: MoveOrderLine[];
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMoveOrderInput {
  orderNumber: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status?: MoveOrderStatus;
  items: Array<{ itemId: string; quantity: number }>;
  referenceNumber?: string;
  notes?: string;
}

export const moveOrderApi = {
  list: (params?: ListParams) =>
    apiFetch<PaginatedResponse<MoveOrder>>(`/move-orders${buildQuery(params || {})}`),

  getById: (id: string) =>
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}`),

  create: (data: CreateMoveOrderInput) =>
    apiFetch<{ data: MoveOrder }>("/move-orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateMoveOrderInput>) =>
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, status: MoveOrderStatus) =>
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/move-orders/${id}`, { method: "DELETE" }),
};
