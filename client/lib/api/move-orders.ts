import { apiFetch, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

export type MoveOrderStatus = "Draft" | "Completed" | "Cancelled";

export interface MoveOrderWarehouseRef {
  _id: string;
  name: string;
}

export interface MoveOrderAssigneeRef {
  _id: string;
  name: string;
  email?: string;
}

export interface MoveOrderLineItem {
  itemId: string | { _id: string; name?: string; sku?: string };
  itemName?: string;
  sku?: string;
  quantityTransferred: number;
}

export interface MoveOrder {
  _id: string;
  organizationId: string;
  moveOrderNumber: string;
  moveDate: string;
  sourceWarehouseId: MoveOrderWarehouseRef | string;
  destinationWarehouseId: MoveOrderWarehouseRef | string;
  assigneeId?: MoveOrderAssigneeRef | string | null;
  assigneeName?: string;
  internalNotes?: string;
  status: MoveOrderStatus;
  lineItems: MoveOrderLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMoveOrderLineItemInput {
  itemId: string;
  itemName?: string;
  sku?: string;
  quantityTransferred: number;
}

export interface CreateMoveOrderInput {
  moveOrderNumber: string;
  moveDate: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  assigneeId?: string;
  assigneeName?: string;
  internalNotes?: string;
  status?: MoveOrderStatus;
  lineItems: CreateMoveOrderLineItemInput[];
}

export type UpdateMoveOrderInput = Partial<CreateMoveOrderInput>;

export interface MoveOrderListParams extends ListParams {
  status?: MoveOrderStatus;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
}

export const moveOrderApi = {
  list: (params?: MoveOrderListParams) =>
    apiFetch<PaginatedResponse<MoveOrder>>(
      `/move-orders${buildQuery(params || {})}`,
    ),

  getById: (id: string) => apiFetch<{ data: MoveOrder }>(`/move-orders/${id}`),

  create: (data: CreateMoveOrderInput) =>
    apiFetch<{ data: MoveOrder }>("/move-orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateMoveOrderInput) =>
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/move-orders/${id}`, {
      method: "DELETE",
    }),
};
