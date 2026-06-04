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

// ─── Organization Validators ──────────────────────────────────────────

const ZOHO_MODULES = [
  "dashboard", "contacts", "items", "invoices", "bills",
  "estimates", "purchase_orders", "sales_orders", "credit_notes",
  "vendor_credits", "expenses", "timesheet", "projects", "banking",
  "accounts", "journals", "reports", "tax", "settings", "users",
  "payroll", "inventory", "documents",
] as const;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required"),
  industry: z.string().trim().default("General"),
  baseCurrency: z.string().trim().length(3).toUpperCase().default("INR"),
  fiscalYearStart: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .default(4), // April
  country: z.string().trim().default("India"),
  timezone: z.string().trim().default("Asia/Kolkata"),
  dateFormat: z.string().trim().default("DD/MM/YYYY"),
  numberFormat: z.string().trim().default("1,234,567.89"),
  language: z.string().trim().length(2).toLowerCase().default("en"),
  taxId: z.string().trim().optional(),
  logo: z.string().url().optional().or(z.literal("")),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  templateConfig: z.record(z.string(), z.unknown()).optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

// ─── Role Validators ───────────────────────────────────────────────────

export const rolePermissionSchema = z.object({
  module: z.enum(ZOHO_MODULES),
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  create: z.boolean().default(false),
  delete: z.boolean().default(false),
  approve: z.boolean().default(false),
  export: z.boolean().default(false),
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
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
