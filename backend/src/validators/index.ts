import { z } from "zod";

// ─── Auth Validators ───────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().trim().optional(),
  dob: z.string().or(z.date()).optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
});

export const completeProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  dob: z.string().or(z.date()),
  gender: z.enum(["male", "female", "other"]),
  phone: z.string().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  dob: z.string().or(z.date()).optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  phone: z.string().optional(),
  photoURL: z.string().url().optional().or(z.literal("")),
});

// ─── Company Validators ────────────────────────────────────────────────

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  abbr: z
    .string()
    .trim()
    .min(1)
    .max(10, "Abbreviation must be 10 chars or less")
    .toUpperCase(),
  defaultCurrency: z.string().default("INR"),
  country: z.string().default("India"),
  chartOfAccounts: z.string().default("Standard"),
  domain: z
    .enum(["Distribution", "Manufacturing", "Retail", "Services", ""])
    .default(""),
  fiscalYearStart: z.string().or(z.date()),
  fiscalYearEnd: z.string().or(z.date()),
});

export const updateCompanySchema = createCompanySchema.partial();

// ─── Role Validators ───────────────────────────────────────────────────

export const rolePermissionSchema = z.object({
  doctype: z.string().min(1),
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  create: z.boolean().default(false),
  delete: z.boolean().default(false),
  submit: z.boolean().default(false),
  cancel: z.boolean().default(false),
  amend: z.boolean().default(false),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required"),
  description: z.string().default(""),
  permissions: z.array(rolePermissionSchema).default([]),
});

export const assignRolesSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  roles: z.array(z.string().min(1)).min(1, "At least one role required"),
});

// ─── Pagination Query Validator ────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});

// ─── Type Exports ──────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
