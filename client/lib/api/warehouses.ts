import { apiFetch } from "./client";

export interface Warehouse {
  _id: string;
  orgId?: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const warehouseApi = {
  list: () => apiFetch<{ data: Warehouse[] }>("/warehouses"),
};
