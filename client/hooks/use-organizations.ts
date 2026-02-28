import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  organizationApi,
  type Organization,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type ListParams,
} from "@/lib/api/index";

// ─── Query Keys ─────────────────────────────────────────────────────────

export const organizationKeys = {
  all: ["organizations"] as const,
  lists: () => [...organizationKeys.all, "list"] as const,
  list: (params?: ListParams) =>
    [...organizationKeys.lists(), params] as const,
  details: () => [...organizationKeys.all, "detail"] as const,
  detail: (id: string) => [...organizationKeys.details(), id] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────

export function useOrganizations(params?: ListParams) {
  return useQuery({
    queryKey: organizationKeys.list(params),
    queryFn: () => organizationApi.list(params),
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: organizationKeys.detail(id),
    queryFn: () => organizationApi.getById(id),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationInput) =>
      organizationApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateOrganizationInput;
    }) => organizationApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => organizationApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useSetActiveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => organizationApi.setActive(id),
    onSuccess: () => {
      // Refresh auth/me so activeOrganization is up-to-date
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
