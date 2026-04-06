import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type InventoryDirection = "Increase" | "Decrease";

export interface InventoryAdjustmentItemRef {
  _id: string;
  name: string;
  sku?: string;
}

export interface InventoryAdjustmentWarehouseRef {
  _id: string;
  name: string;
}

export interface InventoryAdjustment {
  _id: string;
  itemId: InventoryAdjustmentItemRef | string;
  warehouseId?: InventoryAdjustmentWarehouseRef | string | null;
  direction: InventoryDirection;
  quantityDelta: number;
  valueDelta: number;
  reason: string;
  referenceNumber?: string;
  notes?: string;
  adjustedAt: string;
  resultingStockOnHand: number;
  resultingInventoryValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLowStockRow {
  _id: string;
  name: string;
  sku?: string;
  stockOnHand: number;
  reorderPoint?: number;
  averageCost: number;
  inventoryValue: number;
}

export interface InventoryOverviewResponse {
  summary: {
    trackedItems: number;
    outOfStockItems: number;
    lowStockItems: number;
    totalQuantity: number;
    totalValue: number;
  };
  lowStock: InventoryLowStockRow[];
  recentAdjustments: InventoryAdjustment[];
}

export interface CreateInventoryAdjustmentInput {
  itemId: string;
  direction: InventoryDirection;
  quantityDelta: number;
  unitCost?: number;
  valueDelta?: number;
  warehouseId?: string;
  reason?: string;
  referenceNumber?: string;
  notes?: string;
  adjustedAt?: string;
}

export interface InventoryAdjustmentListParams extends ListParams {
  itemId?: string;
}

export const inventoryApi = {
  getOverview: () => apiFetch<{ data: InventoryOverviewResponse }>("/inventory/overview"),

  listAdjustments: (params?: InventoryAdjustmentListParams) =>
    apiFetch<PaginatedResponse<InventoryAdjustment>>(
      `/inventory/adjustments${buildQuery(params || {})}`,
    ),

  createAdjustment: (data: CreateInventoryAdjustmentInput) =>
    apiFetch<{ data: InventoryAdjustment }>("/inventory/adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
