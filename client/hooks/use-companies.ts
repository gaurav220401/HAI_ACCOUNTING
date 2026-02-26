import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  companyApi,
  type Company,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type ListParams,
} from "@/lib/api/index";

// ─── Query Keys ─────────────────────────────────────────────────────────

export const companyKeys = {
  all: ["companies"] as const,
  lists: () => [...companyKeys.all, "list"] as const,
  list: (params?: ListParams) => [...companyKeys.lists(), params] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────

export function useCompanies(params?: ListParams) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: () => companyApi.list(params),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => companyApi.getById(id),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompanyInput) => companyApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompanyInput }) =>
      companyApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: companyKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => companyApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

export function useSetActiveCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => companyApi.setActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
