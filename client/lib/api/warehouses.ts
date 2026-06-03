import { apiFetch } from "./client";

export interface Warehouse {
  _id: string;
  organizationId?: string;
  name: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  isPrimary: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const warehouseApi = {
  list: (params?: { includeInactive?: boolean }) => 
    apiFetch<{ data: Warehouse[] }>(`/warehouses${params?.includeInactive ? "?includeInactive=true" : ""}`),
  getOne: (id: string) => 
    apiFetch<{ data: Warehouse }>(`/warehouses/${id}`),
  create: (data: Partial<Warehouse>) => 
    apiFetch<{ data: Warehouse }>("/warehouses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Warehouse>) => 
    apiFetch<{ data: Warehouse }>(`/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => 
    apiFetch<{ message: string }>(`/warehouses/${id}`, { method: "DELETE" }),
};
