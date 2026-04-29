import { apiFetch, buildQuery } from "./client";
<<<<<<< HEAD
import type { PaginatedResponse, ListParams } from "./client";

export type MoveOrderStatus = "Draft" | "Sent" | "In Transit" | "Received" | "Cancelled";

export interface MoveOrderLine {
  itemId: string | { _id: string; name: string; sku?: string };
  quantity: number;
=======
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
>>>>>>> suraj
}

export interface MoveOrder {
  _id: string;
  organizationId: string;
<<<<<<< HEAD
  orderNumber: string;
  date: string;
  fromWarehouseId: string | { _id: string; name: string };
  toWarehouseId: string | { _id: string; name: string };
  status: MoveOrderStatus;
  items: MoveOrderLine[];
  referenceNumber?: string;
  notes?: string;
=======
  moveOrderNumber: string;
  moveDate: string;
  sourceWarehouseId: MoveOrderWarehouseRef | string;
  destinationWarehouseId: MoveOrderWarehouseRef | string;
  assigneeId?: MoveOrderAssigneeRef | string | null;
  assigneeName?: string;
  internalNotes?: string;
  status: MoveOrderStatus;
  lineItems: MoveOrderLineItem[];
>>>>>>> suraj
  createdAt: string;
  updatedAt: string;
}

<<<<<<< HEAD
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
=======
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
>>>>>>> suraj

  create: (data: CreateMoveOrderInput) =>
    apiFetch<{ data: MoveOrder }>("/move-orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

<<<<<<< HEAD
  update: (id: string, data: Partial<CreateMoveOrderInput>) =>
=======
  update: (id: string, data: UpdateMoveOrderInput) =>
>>>>>>> suraj
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

<<<<<<< HEAD
  updateStatus: (id: string, status: MoveOrderStatus) =>
    apiFetch<{ data: MoveOrder }>(`/move-orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/move-orders/${id}`, { method: "DELETE" }),
=======
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/move-orders/${id}`, {
      method: "DELETE",
    }),
>>>>>>> suraj
};
