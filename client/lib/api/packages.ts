import { apiFetch } from "./client";

export interface PackageLineItem {
  itemId: string | { _id: string; name: string };
  name?: string;
  ordered: number;
  packed: number;
  quantityToPack: number;
}

export interface Package {
  _id: string;
  organizationId: string;
  salesOrderId: string;
  packageSlipNumber: string;
  date: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
  weight?: {
    value?: number;
    unit?: string;
  };
  internalNotes?: string;
  lineItems: PackageLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackageInput {
  salesOrderId: string;
  packageSlipNumber: string;
  date: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
  weight?: {
    value?: number;
    unit?: string;
  };
  internalNotes?: string;
  lineItems: Array<Omit<PackageLineItem, "itemId"> & { itemId: string }>;
}

export const packageApi = {
  create: (data: CreatePackageInput) =>
    apiFetch<{ data: Package }>("/packages", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listByOrder: (orderId: string) =>
    apiFetch<{ data: Package[] }>(`/packages/order/${orderId}`),

  get: (id: string) => apiFetch<{ data: Package }>(`/packages/${id}`),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/packages/${id}`, {
      method: "DELETE",
    }),
};
