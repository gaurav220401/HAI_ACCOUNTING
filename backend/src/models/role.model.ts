import { Schema, model, Model, Types } from "mongoose";
import { IRole, ZohoModule } from "../types";

// All Zoho Books modules
const ZOHO_MODULES: ZohoModule[] = [
  "dashboard",
  "contacts",
  "items",
  "invoices",
  "bills",
  "estimates",
  "purchase_orders",
  "sales_orders",
  "credit_notes",
  "vendor_credits",
  "expenses",
  "timesheet",
  "projects",
  "banking",
  "accounts",
  "journals",
  "reports",
  "tax",
  "settings",
  "users",
  "payroll",
  "inventory",
  "documents",
];

// Helper to build a permission object
function perm(
  module: ZohoModule,
  opts: Partial<{
    read: boolean;
    write: boolean;
    create: boolean;
    delete: boolean;
    approve: boolean;
    export: boolean;
  }> = {},
) {
  return {
    module,
    read: opts.read ?? false,
    write: opts.write ?? false,
    create: opts.create ?? false,
    delete: opts.delete ?? false,
    approve: opts.approve ?? false,
    export: opts.export ?? false,
  };
}

// Helper: full access to a module
function fullPerm(module: ZohoModule) {
  return perm(module, {
    read: true,
    write: true,
    create: true,
    delete: true,
    approve: true,
    export: true,
  });
}

// Helper: read-only access to a module
function readPerm(module: ZohoModule) {
  return perm(module, { read: true, export: true });
}

const rolePermissionSchema = new Schema(
  {
    module: {
      type: String,
      enum: ZOHO_MODULES,
      required: true,
    },
    read: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    approve: { type: Boolean, default: false },
    export: { type: Boolean, default: false },
  },
  { _id: false },
);

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    permissions: {
      type: [rolePermissionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

const Role: Model<IRole> = model<IRole>("Role", roleSchema);

/**
 * Seed default Zoho Books-style system roles.
 * Admin, Accountant, Staff, Time Tracker
 */
export async function seedDefaultRoles(): Promise<void> {
  const defaultRoles = [
    // â”€â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      name: "Admin",
      description:
        "Full access to all modules â€” organization owner / super user",
      isSystemRole: true,
      organizationId: null,
      permissions: ZOHO_MODULES.map(fullPerm),
    },

    // â”€â”€ Accountant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      name: "Accountant",
      description:
        "Full access to financial modules; cannot manage users or settings",
      isSystemRole: true,
      organizationId: null,
      permissions: [
        fullPerm("dashboard"),
        fullPerm("contacts"),
        fullPerm("items"),
        fullPerm("invoices"),
        fullPerm("bills"),
        fullPerm("estimates"),
        fullPerm("purchase_orders"),
        fullPerm("sales_orders"),
        fullPerm("credit_notes"),
        fullPerm("vendor_credits"),
        fullPerm("expenses"),
        perm("timesheet", { read: true, export: true }),
        perm("projects", { read: true, export: true }),
        fullPerm("banking"),
        fullPerm("accounts"),
        fullPerm("journals"),
        fullPerm("reports"),
        fullPerm("tax"),
        perm("settings", { read: true }),
        perm("users", { read: false }),
        perm("payroll", { read: true, export: true }),
        fullPerm("inventory"),
        fullPerm("documents"),
      ],
    },

    // â”€â”€ Staff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      name: "Staff",
      description:
        "Can create bills, expenses; read-only access to most modules",
      isSystemRole: true,
      organizationId: null,
      permissions: [
        readPerm("dashboard"),
        readPerm("contacts"),
        readPerm("items"),
        perm("invoices", { read: true }),
        perm("bills", { read: true, write: true, create: true, export: true }),
        readPerm("estimates"),
        readPerm("purchase_orders"),
        readPerm("sales_orders"),
        perm("credit_notes", { read: true }),
        perm("vendor_credits", { read: true }),
        perm("expenses", {
          read: true,
          write: true,
          create: true,
          export: true,
        }),
        perm("timesheet", { read: true, write: true, create: true }),
        perm("projects", { read: true }),
        perm("banking", { read: true }),
        perm("accounts", { read: true }),
        perm("journals", { read: true }),
        readPerm("reports"),
        perm("tax", { read: true }),
        perm("settings", {}),
        perm("users", {}),
        perm("payroll", {}),
        perm("inventory", { read: true }),
        perm("documents", { read: true, create: true }),
      ],
    },

    // â”€â”€ Time Tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      name: "Time Tracker",
      description: "Can only log time and view project timesheets",
      isSystemRole: true,
      organizationId: null,
      permissions: [
        perm("dashboard", { read: true }),
        perm("timesheet", { read: true, write: true, create: true }),
        perm("projects", { read: true }),
      ],
    },
  ];

  for (const role of defaultRoles) {
    await Role.findOneAndUpdate(
      { name: role.name, isSystemRole: true },
      { $setOnInsert: role },
      { upsert: true, returnDocument: 'after' },
    );
  }

  console.log("âœ… Default Zoho Books roles seeded: Admin, Accountant, Staff, Time Tracker");
}

export default Role;
