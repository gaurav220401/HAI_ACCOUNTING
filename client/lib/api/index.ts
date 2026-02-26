export { apiFetch, ApiError, buildQuery } from "./client";
export type { PaginatedResponse, ListParams } from "./client";

export { authApi } from "./auth";
export type { UserProfile, AuthResponse } from "./auth";

export { companyApi } from "./companies";
export type {
  Company,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "./companies";
