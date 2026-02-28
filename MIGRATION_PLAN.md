# HAI_ACCOUNTING — Zoho Books Feature Implementation Plan

## Executive Summary

**Goal**: Build a full-featured cloud accounting software matching **Zoho Books' complete feature set** — covering Receivables, Payables, Banking, Inventory, Projects, Payroll, 70+ Reports, Collaboration Portals, Workflow Automation, and Global Multi-Currency/Multi-Language support — on our Next.js 16 + Express 5 + MongoDB + Firebase Auth stack.

**Current State of HAI_ACCOUNTING**:

- Firebase Auth (email, Google, phone OTP, magic link) — **fully working, stays as-is**
- Express 5 backend with MongoDB Atlas (Mongoose)
- Next.js 16 frontend with shadcn/ui, Tailwind, Recharts, TanStack Table
- Only user model exists; zero accounting logic

**Zoho Books Feature Scope**:

- 12 core modules (Receivables, Payables, Banking, Tax, Inventory, Projects, Payroll, Reports, Collaboration, Automation, Customization, Global)
- 70+ built-in reports
- Customer Portal & Vendor Portal
- Multi-currency (100+ currencies) & Multi-language (25+ languages)
- Workflow automation engine
- Fixed asset management with auto-depreciation
- Budgeting & forecasting
- Connected banking with auto-reconciliation

**Architecture Decision**: We are building from scratch in Node.js/TypeScript, using Zoho Books as the **feature specification**. No code is being ported — this is a ground-up implementation matching Zoho Books' UX and feature parity.

---

## Architecture Foundations (Before Phases)

### Tech Stack Decisions

| Layer        | Technology                                       | Rationale                                    |
| ------------ | ------------------------------------------------ | -------------------------------------------- |
| Frontend     | Next.js 16 (App Router) + TypeScript             | Already in place                             |
| UI           | shadcn/ui + Radix + Tailwind 4                   | Already in place                             |
| Charts       | Recharts 2                                       | Already in place                             |
| Tables       | TanStack Table 8                                 | Already in place                             |
| Backend      | Express 5 + TypeScript                           | Upgrade from current JS to TS                |
| Database     | MongoDB Atlas + Mongoose                         | Already in place                             |
| Auth         | Firebase Auth (client) + Firebase Admin (server) | Already in place — **no changes**            |
| Caching      | Redis (add later)                                | For report caching, session data             |
| Queue        | BullMQ + Redis (add later)                       | For background jobs, recurring transactions  |
| PDF          | Puppeteer or @react-pdf/renderer                 | For invoice/report printing                  |
| File Storage | Firebase Storage or S3                           | For attachments, document storage            |
| Search       | MongoDB Atlas Search                             | For full-text search across entities         |
| Validation   | Zod (shared schemas)                             | Already partially in place                   |
| State Mgmt   | TanStack Query + Zustand                         | Add for proper server state + client state   |
| Real-time    | Socket.io                                        | For live notifications, dashboard updates    |
| i18n         | next-intl or react-i18next                       | Multi-language support (25+ languages)       |
| Email        | Nodemailer + templates                           | Transactional emails, reminders, digests     |
| OCR/Scan     | Tesseract.js or cloud OCR API                    | Receipt/document auto-scanning               |

### Backend Architecture Pattern

```
backend/src/
├── config/              # DB, Firebase, Redis, env configs
├── middlewares/          # Auth, validation, error handling, rate limiting
├── models/              # Mongoose schemas (organized by module)
│   ├── receivables/     # Quotes, Invoices, Sales Orders, Credit Notes
│   ├── payables/        # Bills, Purchase Orders, Expenses, Vendor Credits
│   ├── banking/         # Bank Accounts, Transactions, Reconciliation
│   ├── inventory/       # Items, Price Lists, Adjustments, Packages
│   ├── projects/        # Projects, Tasks, Timesheets
│   ├── payroll/         # Employees, Pay Runs, Payslips
│   ├── accountant/      # Chart of Accounts, Journals, Assets, Budgets
│   └── common/          # Contacts, Currencies, Taxes, Settings
├── routes/              # Express routes (organized by module)
├── controllers/         # Request handlers
├── services/            # Business logic layer (core engine)
│   ├── receivables/
│   ├── payables/
│   ├── banking/
│   ├── inventory/
│   ├── projects/
│   ├── payroll/
│   ├── accountant/
│   ├── tax/
│   └── common/
├── engines/             # Cross-cutting engines
│   ├── tax-calculation.engine.ts
│   ├── currency-exchange.engine.ts
│   ├── naming-series.engine.ts
│   ├── workflow.engine.ts
│   ├── approval.engine.ts
│   ├── recurring.engine.ts
│   ├── notification.engine.ts
│   └── auto-scan.engine.ts
├── portals/             # Customer & Vendor portal APIs
├── jobs/                # Background/scheduled jobs
├── utils/               # Shared utilities
├── validators/          # Zod schemas (shared with frontend)
└── types/               # TypeScript type definitions
```

### Frontend Architecture Pattern

```
client/
├── app/                        # Next.js App Router pages
│   ├── (auth)/                 # Auth pages (login, signup) — EXISTING
│   ├── (app)/                  # Authenticated app shell
│   │   ├── dashboard/
│   │   ├── receivables/
│   │   │   ├── invoices/
│   │   │   ├── quotes/
│   │   │   ├── sales-orders/
│   │   │   ├── credit-notes/
│   │   │   ├── retainer-invoices/
│   │   │   └── payment-received/
│   │   ├── payables/
│   │   │   ├── bills/
│   │   │   ├── purchase-orders/
│   │   │   ├── expenses/
│   │   │   ├── vendor-credits/
│   │   │   └── payments-made/
│   │   ├── banking/
│   │   ├── inventory/
│   │   ├── projects/
│   │   ├── payroll/
│   │   ├── accountant/
│   │   │   ├── chart-of-accounts/
│   │   │   ├── journal-entries/
│   │   │   ├── fixed-assets/
│   │   │   ├── budgets/
│   │   │   └── currency-adjustments/
│   │   ├── reports/
│   │   ├── settings/
│   │   └── automation/
│   ├── portal/                 # Customer & Vendor self-service portals
│   │   ├── customer/
│   │   └── vendor/
│   └── layout.tsx
├── components/
│   ├── ui/                     # shadcn primitives — EXISTING
│   ├── forms/                  # Reusable form components
│   ├── tables/                 # Reusable table components
│   ├── charts/                 # Dashboard chart components
│   ├── layout/                 # Layout components (sidebar, header)
│   ├── portals/                # Portal-specific components
│   └── modules/                # Module-specific components
├── contexts/                   # React contexts — auth EXISTING
├── hooks/                      # Custom hooks
├── lib/                        # Utilities, API client, validators
├── stores/                     # Zustand stores
└── locales/                    # i18n translation files (25+ languages)
```

### MongoDB Schema Design Principles

1. **Organization-scoped**: Every document has an `organizationId` field for multi-org support
2. **Audit trail**: Every document has `createdBy`, `updatedBy`, `createdAt`, `updatedAt` — tamper-proof audit log
3. **Soft delete**: `isDeleted` flag instead of hard deletes on transactional data
4. **Status workflow**: `status` field with module-specific statuses (Draft, Sent, Overdue, Paid, Void, etc.)
5. **Naming series**: Auto-generated document numbers (e.g., `INV-00001`, `QUO-00001`)
6. **Indexing strategy**: Compound indexes on frequently queried fields (org + date + status)
7. **Denormalization**: Store frequently accessed names alongside IDs to reduce lookups
8. **Embedded vs Referenced**: Line items (invoice items, bill items) are embedded arrays; master data (contacts, items) is referenced
9. **Multi-currency**: Every monetary field stores amount + currency + exchange rate + base currency amount
10. **Reporting tags**: Flexible tagging system for divisional/cost-center reporting

---

## Phase 0: Infrastructure & Foundation (Week 1-2)

> **Goal**: Set up the architectural foundation, development tooling, and shared infrastructure that all future phases depend on.

### 0.1 Backend TypeScript Migration

- [ ] Convert backend from CommonJS JavaScript to TypeScript
- [ ] Set up `tsconfig.json` with strict mode
- [ ] Add `ts-node-dev` or `tsx` for development
- [ ] Convert existing files: `server.js` → `server.ts`, models, routes, middlewares, controllers
- [ ] Add path aliases (`@/models`, `@/services`, etc.)

### 0.2 Shared Validation Layer

- [ ] Create `shared/` or `validators/` directory with Zod schemas
- [ ] Schemas shared on both frontend (form validation) and backend (request validation)
- [ ] Set up schema export pattern for frontend consumption

### 0.3 Backend Architecture Setup

- [ ] Create folder structure: `models/`, `routes/`, `controllers/`, `services/`, `engines/`, `portals/`, `jobs/`, `utils/`, `types/`, `validators/`
- [ ] Implement base service class with common CRUD operations
- [ ] Implement base controller class with error handling
- [ ] Create generic validation middleware using Zod
- [ ] Create generic pagination middleware with sorting and filtering
- [ ] Implement structured error handling middleware
- [ ] Add request logging middleware (pino)
- [ ] Add rate limiting middleware

### 0.4 Core Mongoose Plugins & Utilities

- [ ] Create `auditTrail` plugin (auto-add `createdBy`, `updatedBy` from `req.user`, tamper-proof log)
- [ ] Create `softDelete` plugin (`isDeleted`, `deletedAt`, `deletedBy`)
- [ ] Create `organizationScoped` plugin (auto-add `organizationId`, enforce in queries)
- [ ] Create `namingSeries` utility (auto-incrementing document numbers per org)
- [ ] Create `multiCurrency` utility (store amount + currency + exchange rate + base amount)
- [ ] Create `activityLog` plugin (track all field-level changes for audit trail)

### 0.5 Frontend State Management Upgrade

- [ ] Install and configure **TanStack Query** for server state
- [ ] Create API client factory organized by module (`lib/api/receivables.ts`, `lib/api/payables.ts`, etc.)
- [ ] Create custom hooks pattern: `useQuery` + `useMutation` wrappers per entity
- [ ] Install **Zustand** for client-side state (sidebar state, filters, UI preferences)
- [ ] Add optimistic updates pattern for common operations

### 0.6 Frontend Reusable Components

- [ ] Build **GenericForm** component (dynamic form rendering from schema)
- [ ] Build **GenericListView** component (table + filters + pagination + search + bulk actions)
- [ ] Build **GenericDetailView** component (document view with status bar + actions)
- [ ] Build **LineItemTable** component (editable rows for invoice/bill line items)
- [ ] Build **LinkField** / **ContactPicker** component (searchable select for contacts/items)
- [ ] Build **CurrencyInput** component (formatted number input with currency symbol)
- [ ] Build **DateRangePicker** component for report filters
- [ ] Build **StatusBadge** component (Draft, Sent, Overdue, Paid, Void, Partially Paid, etc.)
- [ ] Build **TreeView** component (for Chart of Accounts hierarchy)
- [ ] Build **PrintView** component (for PDF generation of invoices, quotes, reports)
- [ ] Build **FileUpload** / **DocumentAttachment** component
- [ ] Build **CommentThread** component (for transaction-level discussion)
- [ ] Build **ApprovalWorkflow** component (approval status bar + approve/reject actions)
- [ ] Build **TimerWidget** component (start/stop time tracking for projects)

### 0.7 Role-Based Access Control (RBAC)

- [ ] Design role model: `Role`, `RolePermission`, `UserRole`
- [ ] Predefined roles: Admin, Accountant, Staff, Time Tracker, Custom Roles
- [ ] Module-level permissions (read, write, create, delete, approve)
- [ ] Backend middleware: `authorize('invoices', 'write')`
- [ ] Frontend: `usePermission('invoices', 'write')` hook for conditional rendering
- [ ] Custom role builder (Zoho Books supports custom roles with granular module access)
- [ ] Add `role` field to User model in MongoDB

### 0.8 Multi-Organization Foundation

- [ ] Design Organization model (name, industry, country, base currency, fiscal year start, tax ID, logo, address)
- [ ] Organization setup wizard (first-time onboarding)
- [ ] Every model gets an `organizationId` field
- [ ] Organization switcher in header (multi-org support like Zoho Books)
- [ ] Backend: Organization context automatically applied to all queries
- [ ] Organization settings page (preferences, defaults, branding)

### 0.9 Multi-Language (i18n) Foundation

- [ ] Set up `next-intl` or `react-i18next`
- [ ] Extract all UI strings into translation files
- [ ] Support 25+ languages (English, Hindi, Spanish, French, German, Arabic, Chinese, Japanese, etc.)
- [ ] Per-organization language setting
- [ ] Per-contact language preference (for sending documents in customer's language)
- [ ] Transaction document templates with language support

### Deliverables

- TypeScript backend with proper architecture
- RBAC system with custom roles integrated with Firebase Auth
- Reusable frontend components for forms, lists, trees, line items, approvals
- TanStack Query + Zustand state management
- Multi-organization foundation
- Multi-language (i18n) foundation
- Mongoose plugins for audit trail, soft delete, activity log, naming series
- Tamper-proof audit trail system

---

## Phase 1: Setup & Master Data (Week 3-5)

> **Goal**: Implement all foundational master data — the backbone of every transaction in the system.

### 1.1 Organization Setup

- [ ] **Organization** model & CRUD (name, industry, address, logo, tax ID, base currency, fiscal year start, time zone, date format, number format)
- [ ] Organization creation wizard (step-by-step onboarding flow)
- [ ] Organization settings page (general, preferences, branding)
- [ ] Organization-wise default values (payment terms, tax preferences, etc.)
- [ ] Opening balances import (migration from existing systems)

### 1.2 Chart of Accounts

- [ ] **Account** model (name, code, parent, type, root_type [Asset/Liability/Equity/Income/Expense], is_group, organization, description)
- [ ] Pre-built Chart of Accounts templates:
  - Indian Standard
  - US GAAP
  - IFRS
  - UK Standard
  - UAE Standard
  - Custom (blank)
- [ ] Tree view UI for Chart of Accounts (expandable/collapsible hierarchy)
- [ ] Add sub-accounts within any category
- [ ] Edit/delete accounts (with validation — can't delete if transactions exist)
- [ ] Account balance display in tree
- [ ] **General Ledger** linked to Chart of Accounts

### 1.3 Contacts (Customers & Vendors)

- [ ] **Contact** model (type [Customer/Vendor/Both], display_name, company_name, email, phone, currency, payment_terms, tax_treatment, tax_id, billing_address, shipping_address, contact_persons[], notes, portal_enabled, language, reporting_tags[])
- [ ] Contact list view with search, filters, and bulk actions
- [ ] Contact detail page with full transaction history
- [ ] Import contacts from CSV/Excel
- [ ] Merge duplicate contacts
- [ ] **Contact Person** sub-model (multiple contacts per organization)
- [ ] Customer-specific fields: credit limit, sales person
- [ ] Vendor-specific fields: payment terms, TDS category

### 1.4 Items & Services

- [ ] **Item** model (type [Goods/Service], name, SKU, unit, description, selling_price, cost_price, tax_preference, hsn_sac_code, inventory_tracked, stock_on_hand, reorder_point, preferred_vendor, image, is_active)
- [ ] **Item Group** model (hierarchical categorization)
- [ ] Item list view with search and filters
- [ ] Item detail page with price history, transaction history
- [ ] Import items from CSV/Excel
- [ ] **Unit of Measurement** model (nos, kg, hrs, etc.) + custom units

### 1.5 Price Lists

- [ ] **Price List** model (name, type [Sales/Purchase], currency, items with custom prices)
- [ ] Create custom price lists with markup/markdown percentages
- [ ] Associate price lists to contacts or transactions
- [ ] Effective date ranges for price lists
- [ ] Bulk price updates

### 1.6 Currency & Exchange Rates

- [ ] **Currency** model (code, name, symbol, decimal_places, enabled)
- [ ] Pre-loaded 100+ world currencies
- [ ] **Currency Exchange Rate** model (from, to, date, rate)
- [ ] Auto-fetch exchange rates from API (scheduled daily)
- [ ] Manual exchange rate entry
- [ ] Exchange rate history

### 1.7 Tax Configuration

- [ ] **Tax** model (name, rate, type [Tax Group/Simple Tax], tax_authority, is_compound, description)
- [ ] **Tax Group** model (group of taxes applied together, e.g., CGST + SGST)
- [ ] **Tax Exemption** model
- [ ] **Tax Treatment** per contact (taxable, tax exempt, reverse charge, etc.)
- [ ] GST-specific: CGST, SGST, IGST, Cess rates
- [ ] **HSN/SAC Code** support on items
- [ ] Default tax per item / per contact / per organization

### 1.8 Payment Terms

- [ ] **Payment Terms** model (name, days, discount_percentage, discount_days)
- [ ] Pre-built templates: Net 15, Net 30, Net 45, Net 60, Due on Receipt, Custom
- [ ] Early payment discount support
- [ ] Late payment penalty configuration
- [ ] Default payment terms per contact

### 1.9 Other Setup Masters

- [ ] **Warehouse / Location** model (for inventory tracking)
- [ ] **Sales Person** model (for assigning to customers/invoices)
- [ ] **Mode of Payment** model (Cash, Bank Transfer, Credit Card, UPI, Check, etc.)
- [ ] **Expense Category** model (Travel, Office Supplies, Utilities, etc.)
- [ ] **Reporting Tag** model (for divisional P&L — cost centers, revenue streams, business areas)
- [ ] **Custom Fields** engine (add custom fields to any entity)

### 1.10 Settings Pages

- [ ] **General Settings** (organization info, fiscal year, date/number format)
- [ ] **Tax Settings** (default taxes, GST configuration)
- [ ] **Invoice Settings** (default terms, invoice numbering, auto-reminders)
- [ ] **Notification Preferences** (email notification toggles)
- [ ] **Online Payment Settings** (payment gateway configuration)
- [ ] **Portal Settings** (customer/vendor portal configuration)
- [ ] **Connected Accounts** (integrations)

### Deliverables

- Organization setup with onboarding wizard
- Chart of Accounts with templates and tree UI
- Contacts (Customer/Vendor) with full CRUD
- Items & Services with pricing
- Price Lists with markup/markdown
- Tax configuration (including GST)
- Payment terms templates
- Reporting tags for divisional reports
- All master data import/export

---

## Phase 2: Receivables — Invoicing & Sales (Week 6-10)

> **Goal**: Implement the complete receivables cycle — Quotes → Sales Orders → Invoices → Payments Received → Credit Notes. This is the heart of Zoho Books.

### 2.1 Quotes (Estimates)

- [ ] **Quote** model (quote_number, customer, items[], taxes[], discount, shipping_charges, adjustment, notes, terms, valid_till, status [Draft/Sent/Accepted/Declined/Expired/Invoiced])
- [ ] **Quote Item** embedded (item, description, quantity, rate, discount, tax, amount)
- [ ] Quote form:
  - Customer selection with auto-fill (address, payment terms, tax)
  - Item table with real-time tax calculation
  - Discount (per-line + overall percentage or flat)
  - Shipping charges
  - Notes & terms
  - Custom fields
- [ ] Professional quote PDF with custom branding (logo, colors, fonts)
- [ ] Send quote via email from within the app
- [ ] Quote approval workflow:
  - **Single-level approval** (one approver)
  - **Multi-level approval** (sequential approval chain)
  - Approve/reject with comments
- [ ] Quote → Sales Order conversion (one-click)
- [ ] Quote → Invoice conversion (one-click)
- [ ] **Partial invoicing / Progress Invoicing**: Invoice partial amounts per line item from a quote
- [ ] Quote expiry tracking with alerts
- [ ] **Declined Quote** with reason tracking
- [ ] Quote list view with status filters (Open, Accepted, Declined, Expired, Invoiced)
- [ ] Duplicate quote functionality

### 2.2 Sales Orders

- [ ] **Sales Order** model (order_number, customer, items[], taxes[], delivery_date, status [Draft/Confirmed/Closed/Void], invoiced_status [Not Invoiced/Partially Invoiced/Invoiced])
- [ ] **Sales Order Item** embedded (item, quantity, rate, invoiced_qty, remaining_qty)
- [ ] Sales Order form (similar to quote form)
- [ ] Sales Order from Quote (auto-populate)
- [ ] Sales Order → Invoice conversion (full or partial)
- [ ] Sales Order → Purchase Order conversion (when stock insufficient — "dropship" workflow)
- [ ] Track fulfillment status per line item
- [ ] Sales Order approval workflow (single/multi-level)
- [ ] Backorder management
- [ ] Sales Order list view with delivery/invoice status tracking

### 2.3 Invoices (Sales Invoices)

- [ ] **Invoice** model (invoice_number, customer, items[], taxes[], discount, shipping_charges, adjustment, notes, terms, due_date, payment_terms, status [Draft/Sent/Partially Paid/Paid/Overdue/Void], amount_due, payment_received, credits_applied, write_off_amount, currency, exchange_rate)
- [ ] **Invoice Item** embedded (item, description, quantity, rate, discount, tax, amount, hsn_sac_code)
- [ ] Invoice form:
  - Customer selection with auto-fill
  - Item table with real-time tax + total calculation
  - Discount handling (per-line + overall)
  - Shipping charges + adjustments
  - Payment terms with auto-calculated due date
  - Attach files to invoice
  - Custom fields
- [ ] **GL posting on creation/send**:
  - Debit: Accounts Receivable
  - Credit: Income Account (per item)
  - Credit/Debit: Tax accounts
- [ ] Professional invoice PDF with custom branding
- [ ] Send invoice via email with PDF attachment
- [ ] **Payment link in invoice email** (online payment)
- [ ] **Automated payment reminders**:
  - Configure reminder intervals (e.g., 3 days before due, on due date, 7 days after, 14 days after)
  - Auto-send or manual trigger
- [ ] Invoice approval workflow (single/multi-level)
- [ ] **Recurring invoices**:
  - Set frequency (daily/weekly/monthly/yearly/custom)
  - Auto-create and optionally auto-send
  - End date or number of occurrences
- [ ] **Invoice from Sales Order** (full or partial)
- [ ] **Invoice from Quote** (full or partial / progress invoicing)
- [ ] **Write-off** small balances
- [ ] Mark invoice as **Void** (with GL reversal)
- [ ] **Clone invoice** functionality
- [ ] Invoice list view with ageing indicators, status filters
- [ ] **Bulk invoice actions** (send, print, mark as sent, mark as void)
- [ ] **Invoice payment recording** (record payment directly from invoice)
- [ ] **Overdue auto-flagging** (scheduled job)

### 2.4 Payment Received

- [ ] **Payment Received** model (payment_number, customer, date, amount, payment_mode, reference_number, deposit_to_account, invoices_allocated[], excess_amount, currency, exchange_rate)
- [ ] **Payment Allocation** embedded (invoice_id, invoice_number, amount_due, payment_allocated)
- [ ] Payment received form:
  - Customer selection → auto-fetch unpaid invoices
  - Allocate payment across one or multiple invoices
  - Partial payment support
  - Excess payment → customer credit balance
  - Multi-currency with exchange rate
- [ ] GL posting:
  - Debit: Bank/Cash Account
  - Credit: Accounts Receivable
  - Exchange gain/loss if multi-currency
- [ ] **Online payment integration** (payment gateways: Stripe, Razorpay, PayPal)
- [ ] Payment received list view
- [ ] **Refund** functionality (reverse a payment)
- [ ] **Auto-charge** saved cards for recurring invoices

### 2.5 Credit Notes

- [ ] **Credit Note** model (credit_note_number, customer, items[], taxes[], reason, status [Draft/Open/Closed/Void], remaining_credits)
- [ ] Credit Note from invoice (return/adjustment)
- [ ] Standalone credit note
- [ ] Apply credit note to outstanding invoices
- [ ] Refund credit note to customer (creates payment record)
- [ ] GL posting (reverse of invoice)
- [ ] Credit Note approval workflow

### 2.6 Retainer Invoices (Advance Payments)

- [ ] **Retainer Invoice** model (customer, amount, description, status [Draft/Sent/Paid/Partially Applied/Fully Applied])
- [ ] Collect advance/retainer payments before project start
- [ ] Apply retainer towards future invoices
- [ ] Track unused retainer balance
- [ ] GL posting: Debit Receivable, Credit Unearned Revenue → transfer to Revenue on application

### 2.7 Sales Receipts (Instant Payments)

- [ ] **Sales Receipt** model (customer, items[], taxes[], payment_method, deposit_to) — invoice + payment combined
- [ ] For walk-in / immediate-payment scenarios
- [ ] GL posting for both revenue and payment in one go

### 2.8 Customer Statements

- [ ] Generate **Statement of Account** for any customer (date range)
- [ ] Email statements to customers
- [ ] PDF export
- [ ] Bulk statement generation and emailing

### Deliverables

- Complete quotation workflow with approval and progress invoicing
- Sales Orders with fulfillment tracking
- Full invoicing with recurring, reminders, online payments
- Payment received with multi-invoice allocation
- Credit Notes and Retainer Invoices
- Customer statements
- GL posting for all receivable transactions
- Professional PDF templates with branding
- Sales approval workflows (single and multi-level)

---

## Phase 3: Payables — Bills & Expenses (Week 11-14)

> **Goal**: Implement complete payables management — Purchase Orders → Bills → Payments Made → Vendor Credits + Expense Tracking.

### 3.1 Purchase Orders

- [ ] **Purchase Order** model (po_number, vendor, items[], taxes[], delivery_date, status [Draft/Issued/Closed/Cancelled], billed_status [Unbilled/Partially Billed/Billed])
- [ ] **Purchase Order Item** embedded (item, quantity, rate, received_qty, billed_qty)
- [ ] Purchase Order form:
  - Vendor selection with auto-fill
  - Item table with pricing
  - Tax calculation
  - Expected delivery date
  - Terms & conditions
- [ ] **Purchase Order from Sales Order** (to replenish stock for customer orders)
- [ ] Track delivery and billing status per line item
- [ ] Purchase Order → Bill conversion
- [ ] Purchase Order approval workflow (single/multi-level to prevent unauthorized purchases)
- [ ] Send PO to vendor via email
- [ ] PO list view with status tracking
- [ ] **3-Way Matching (BillPay)**: Match Bills ↔ Purchase Orders ↔ Receipts
  - Flag price mismatches
  - Flag quantity mismatches
  - Approve only verified bills for payment

### 3.2 Bills (Vendor Bills / Purchase Invoices)

- [ ] **Bill** model (bill_number, vendor, vendor_invoice_number, items[], taxes[], due_date, payment_terms, status [Draft/Open/Partially Paid/Paid/Overdue/Void], amount_due, payments_made, credits_applied)
- [ ] **Bill Item** embedded (item, description, quantity, rate, tax, amount, expense_account)
- [ ] Bill form:
  - Vendor selection with auto-fill
  - Line items with expense account allocation
  - Tax calculation
  - Payment terms with due date
  - Attach vendor invoice document
- [ ] **Bill from Purchase Order** (auto-populate from PO)
- [ ] **Bill from vendor portal** (vendor uploads invoice → converted to bill)
- [ ] GL posting on approval/save:
  - Debit: Expense / Inventory Account
  - Credit: Accounts Payable
  - Tax accounts
- [ ] Bill approval workflow (single/multi-level)
- [ ] Recurring bills (for regular vendor expenses)
- [ ] Bill list view with ageing indicators, status filters
- [ ] **Overdue auto-flagging** (scheduled job)
- [ ] Mark bill as Void

### 3.3 Payments Made

- [ ] **Payment Made** model (payment_number, vendor, date, amount, payment_mode, reference_number, paid_from_account, bills_allocated[], excess_amount)
- [ ] **Payment Allocation** embedded (bill_id, bill_number, amount_due, payment_allocated)
- [ ] Payment form:
  - Vendor selection → auto-fetch unpaid bills
  - Allocate across one or multiple bills
  - Partial payment support
  - Excess payment → vendor credit balance
  - Multi-currency with exchange rate
- [ ] GL posting:
  - Debit: Accounts Payable
  - Credit: Bank/Cash Account
- [ ] Payment list view
- [ ] **Refund from vendor** recording
- [ ] **Direct bank payment** (connected banking — pay vendor directly from app)

### 3.4 Vendor Credits

- [ ] **Vendor Credit** model (credit_number, vendor, items[], taxes[], reason, status [Draft/Open/Closed/Void], remaining_credits)
- [ ] Vendor Credit from Bill (return/adjustment)
- [ ] Apply vendor credit to outstanding bills
- [ ] Refund vendor credit
- [ ] GL posting
- [ ] Vendor Credit approval workflow

### 3.5 Expenses

- [ ] **Expense** model (date, category, amount, tax, vendor, paid_through_account, receipt_image, notes, is_billable, customer, project, status [Draft/Approved/Invoiced/Reimbursed])
- [ ] **Expense Category** model (name, account)
- [ ] Expense form with receipt upload
- [ ] **Auto-scan receipts** (OCR):
  - Upload receipt image → auto-extract vendor, amount, date, category
  - Create expense automatically from scan
- [ ] **Recurring expenses** (set frequency for repeating expenses)
- [ ] Billable expenses (tag to customer/project → add to invoice)
- [ ] Expense list view with category/vendor/date filters
- [ ] Expense → Invoice conversion (bill customer for expenses)
- [ ] **Mileage tracking** (for travel expenses)
- [ ] Bulk expense import from CSV

### 3.6 Document Management

- [ ] **Document** model (name, folder, file, tags, linked_transaction)
- [ ] Central document repository
- [ ] Organize documents in custom folders
- [ ] Attach receipts/invoices to transactions
- [ ] Auto-scan documents → create transactions
- [ ] Search documents by name, tag, folder
- [ ] Document retention policies

### Deliverables

- Purchase Order lifecycle with 3-way matching (BillPay)
- Full bill management with recurring and approvals
- Payment made with multi-bill allocation
- Vendor Credits
- Expense tracking with receipt OCR auto-scan
- Document management system
- GL posting for all payable transactions
- Purchase approval workflows

---

## Phase 4: Banking & Reconciliation (Week 15-17)

> **Goal**: Connect bank accounts, auto-import transactions, categorize, match, and reconcile for swift month-end closing.

### 4.1 Bank Account Management

- [ ] **Bank Account** model (bank_name, account_number, account_type [Savings/Checking/Credit Card], currency, opening_balance, current_balance, is_primary, account_linked_to [GL account])
- [ ] Add multiple bank and credit card accounts
- [ ] Bank account dashboard (balance, recent transactions, reconciliation status)

### 4.2 Bank Feeds (Auto-Import)

- [ ] **Bank Transaction** model (date, description, reference, amount, type [Deposit/Withdrawal], status [Uncategorized/Matched/Categorized/Excluded/Reconciled], matched_transaction)
- [ ] **Automatic bank feeds** via:
  - Plaid / Yodlee integration (for auto-fetch)
  - Bank-specific APIs (partner banks)
- [ ] **Manual bank statement import**:
  - CSV import
  - OFX/QFX format support
  - MT940 format support
  - PDF statement parsing (OCR)
- [ ] Auto-fetch bank feeds on schedule (daily)
- [ ] Bank transaction list view (all imported transactions)

### 4.3 Transaction Categorization & Matching

- [ ] **Auto-match** imported bank transactions with existing:
  - Invoices (by amount + date)
  - Bills (by amount + date)
  - Payments (by reference number)
  - Expenses (by amount)
- [ ] **Manual matching** — select and match bank transaction with one or multiple transactions
- [ ] **Auto-categorize** using **Bank Rules**:
  - **Bank Rule** model (conditions [description contains X, amount range, etc.], action [categorize to account, create expense, tag to contact])
  - Rules auto-apply to new imports
- [ ] Categorize unmatched transactions:
  - As an expense (auto-create expense)
  - As income (auto-create other income)
  - As transfer between accounts
  - Manual journal entry
- [ ] **Exclude** irrelevant transactions (personal transactions in business account)
- [ ] Bulk categorization actions

### 4.4 Bank Reconciliation

- [ ] Reconciliation workflow:
  1. Select bank account
  2. Enter statement ending date and ending balance
  3. Match/check off reconciled transactions
  4. View difference (should be zero when complete)
  5. Complete reconciliation
- [ ] **Reconciliation summary** (reconciled, unreconciled, difference)
- [ ] **Auto-reconcile** (one-click match all perfectly matching transactions)
- [ ] Reconciliation history (view past reconciliations)
- [ ] **Undo reconciliation** if needed
- [ ] Month-end closing acceleration

### 4.5 Connected Banking (Advanced)

- [ ] **Live account balance** view (real-time from bank API)
- [ ] **Direct vendor bill payment** from within the app (ACH/NEFT/IMPS/UPI)
- [ ] **Payment status tracking** for direct payments
- [ ] Partner bank integrations (HSBC, Standard Chartered, Kotak, Yes Bank, etc.)

### 4.6 Cash & Petty Cash

- [ ] **Cash Account** tracking
- [ ] Petty cash management
- [ ] Cash register for POS-like scenarios

### Deliverables

- Multi-bank account management
- Auto-import bank feeds (manual + API)
- Bank Rules for auto-categorization
- Auto-match and manual match with transactions
- Full reconciliation workflow
- Connected banking (balance view + direct payments)
- Cash management

---

## Phase 5: Tax Compliance (Week 18-20)

> **Goal**: Full tax compliance including GST, e-invoicing, VAT, TDS/TCS — filing-ready returns directly from the app.

### 5.1 GST Foundation (India)

- [ ] **GST Settings** (GSTIN, GST registration type, reverse charge applicability)
- [ ] Auto-apply GST rates based on:
  - Place of supply (intra-state → CGST+SGST, inter-state → IGST)
  - Item HSN/SAC code
  - Customer GST treatment (registered, unregistered, SEZ, overseas, composition)
- [ ] GST tax types: CGST, SGST, IGST, Cess
- [ ] **Reverse Charge Mechanism** support
- [ ] **Place of Supply** auto-detection
- [ ] **GST Treatment** per contact (Registered, Unregistered, Consumer, SEZ, Overseas, Composition, UIN)
- [ ] **GSTIN Validation** against government database

### 5.2 GST Returns & Filing

- [ ] **GSTR-1** report (outward supplies summary)
  - B2B, B2C Large, B2C Small, Credit/Debit Notes, Exports, HSN Summary
- [ ] **GSTR-3B** report (monthly return summary)
- [ ] **Tax Summary** report (tax collected vs paid)
- [ ] **GST Reconciliation** (match purchase with GSTR-2A/2B from portal)
- [ ] **File returns directly** to GST portal from the app (GST Suvidha Provider integration)
- [ ] Track filing status and due dates

### 5.3 GST E-Invoicing

- [ ] Generate **IRN (Invoice Reference Number)** for B2B invoices
- [ ] Push invoices to **e-invoicing portal (IRP)** individually or in bulk
- [ ] Auto-generate **QR code** on invoices
- [ ] E-invoice acknowledgment tracking
- [ ] Cancel e-invoice support

### 5.4 E-Way Bill

- [ ] **E-Way Bill** generation for goods movement
- [ ] Auto-generate from invoices / delivery challans
- [ ] E-Way Bill portal integration
- [ ] Part A and Part B (transport details)

### 5.5 Invoice Management System (IMS)

- [ ] View inward invoices from GST portal
- [ ] Accept, reject, or mark as pending for review
- [ ] Ensure accurate Input Tax Credit (ITC) claims
- [ ] Reconcile IMS with purchase records

### 5.6 TDS / TCS (India)

- [ ] **TDS Section** configuration (194C, 194J, 194H, etc.)
- [ ] Auto-deduct TDS on vendor payments
- [ ] **TCS** collection on sales above threshold
- [ ] TDS/TCS reports for quarterly filing

### 5.7 Delivery Challan & Bill of Supply

- [ ] **Delivery Challan** (for goods sent on approval, job work, etc.)
- [ ] **Bill of Supply** (for composition scheme, exempted goods)
- [ ] **Bill of Entry** (for imports)

### 5.8 VAT (UAE/UK/EU)

- [ ] VAT configuration (standard rate, zero-rated, exempt, reverse charge)
- [ ] **VAT Return (VAT 201)** for UAE
- [ ] **Making Tax Digital (MTD)** for UK
- [ ] **EU VAT MOSS** support
- [ ] TRN (Tax Registration Number) validation

### 5.9 US Sales Tax

- [ ] State-wise sales tax configuration
- [ ] **Tax nexus** tracking
- [ ] Tax-exempt customers and items
- [ ] **1099 reporting** for contractors/vendors

### 5.10 Tax Reports

- [ ] Tax Summary (tax collected vs tax paid)
- [ ] Tax Liability report
- [ ] Input Tax Credit report
- [ ] HSN Summary
- [ ] TDS Summary
- [ ] GSTR-1 / GSTR-3B formatted reports
- [ ] VAT return formatted reports

### Deliverables

- Complete GST compliance (GSTIN, HSN, place of supply, reverse charge)
- GSTR-1, GSTR-3B reports and filing
- E-invoicing with IRN and QR code
- E-Way Bill generation
- TDS/TCS support
- Invoice Management System
- VAT compliance (UAE/UK)
- US sales tax
- All tax reports filing-ready

---

## Phase 6: Inventory & Stock Management (Week 21-24)

> **Goal**: Complete inventory tracking — item management, stock tracking, reorder, adjustments, packages, shipments — matching Zoho Books' inventory module.

### 6.1 Inventory Item Tracking

- [ ] Enable/disable inventory tracking per item
- [ ] **Stock on Hand** per item per warehouse (real-time)
- [ ] **Stock movement** on every transaction:
  - Sales Invoice → reduce stock
  - Purchase Bill (with item receipt) → increase stock
  - Manual adjustments → increase/decrease stock
- [ ] Stock ledger (all movements per item)
- [ ] Cost of Goods Sold (COGS) auto-calculation

### 6.2 Valuation Methods

- [ ] **FIFO** (First In, First Out) — default
- [ ] **Weighted Average** valuation
- [ ] Per-item valuation method selection
- [ ] Valuation rate recalculation on returns/adjustments

### 6.3 Inventory Adjustments

- [ ] **Inventory Adjustment** model (date, reason, items[], adjustment_account)
- [ ] Adjust stock quantity (for damage, loss, found items)
- [ ] Adjust stock value (for revaluation)
- [ ] GL posting for adjustments
- [ ] Adjustment history tracking

### 6.4 Composite Items (Kitting / Bundling)

- [ ] **Composite Item** model (finished item + component items with quantities)
- [ ] Bundle/unbundle composite items
- [ ] Auto-stock deduction of components when composite item is sold
- [ ] Track composite item availability based on component stock

### 6.5 Item Groups

- [ ] Hierarchical item groups (categories/subcategories)
- [ ] Group-level pricing, tax, and reporting
- [ ] Tree view for item group management

### 6.6 Packages & Shipments

- [ ] **Package** model (sales_order, items[], tracking_number, carrier, weight, dimensions)
- [ ] Create packages from Sales Orders
- [ ] **Shipment** tracking (carrier, tracking number, status)
- [ ] Shipping carrier integrations
- [ ] **Delivery confirmation** tracking
- [ ] Shipment list view

### 6.7 Reorder & Stock Alerts

- [ ] **Reorder Point** per item (threshold quantity)
- [ ] **Reorder alerts** when stock falls below reorder point
- [ ] Quick action: Create Purchase Order from reorder alert
- [ ] Preferred vendor auto-selection
- [ ] Low stock dashboard widget

### 6.8 Warehouses

- [ ] Multiple warehouse support
- [ ] **Warehouse** model (name, address, is_primary)
- [ ] Stock tracking per warehouse per item
- [ ] Inter-warehouse stock transfer
- [ ] Warehouse-wise stock reports

### 6.9 Bulk Adjustments

- [ ] Bulk inventory import (CSV/Excel)
- [ ] Bulk quantity adjustment
- [ ] Bulk price update
- [ ] Opening stock import

### 6.10 eCommerce Inventory Sync (Future)

- [ ] Integration framework for eCommerce platforms
- [ ] Sync stock levels with Amazon, Shopify, Etsy, eBay, WooCommerce
- [ ] Auto-deduct stock on online sales
- [ ] Multi-channel inventory management

### 6.11 Inventory Reports

- [ ] **Inventory Summary** (current stock, value per item)
- [ ] **Inventory Valuation Summary** (FIFO/Weighted Average)
- [ ] **Stock Movement** report (all ins and outs)
- [ ] **FIFO Cost Lot Tracking**
- [ ] **Product Sales** report
- [ ] **Active Items** report
- [ ] **Warehousing Details** report
- [ ] **ABC Analysis** (classify items by value/movement)

### Deliverables

- Real-time inventory tracking per item per warehouse
- FIFO and Weighted Average valuation
- Inventory adjustments with GL posting
- Composite items (kitting/bundling)
- Packages and shipments with tracking
- Reorder points with alerts
- Multi-warehouse support
- All inventory reports

---

## Phase 7: Projects & Timesheets (Week 25-28)

> **Goal**: Project accounting with budgets, tasks, timesheets, billing, and profitability analysis — matching Zoho Books' Projects module.

### 7.1 Projects

- [ ] **Project** model (name, customer, description, billing_method [Fixed Cost/Based on Task Hours/Based on Staff Hours/Based on Project Hours], status [In Progress/On Hold/Completed], start_date, end_date, budget_type, budget_amount, logged_hours, billable_hours, billed_hours)
- [ ] Project list view (with status, progress, billing summary)
- [ ] Project detail page:
  - Overview (summary, status, dates, customer)
  - Tasks tab
  - Timesheets tab
  - Invoices tab
  - Expenses tab
  - Comments/activity log

### 7.2 Project Budgeting

- [ ] **Cost Budget** per project (estimated expenses)
- [ ] **Revenue Budget** per project (estimated income)
- [ ] Budget types: Total Project Hours, Task-wise Hours, Staff-wise Hours
- [ ] **Budget vs Actuals** tracking (real-time comparison)
- [ ] Budget alerts (when approaching or exceeding budget)
- [ ] Budget version history

### 7.3 Tasks

- [ ] **Task** model (project, name, description, assigned_to, status [Not Started/In Progress/Completed], priority [Low/Medium/High], start_date, end_date, budgeted_hours, logged_hours, billable, rate)
- [ ] Task list within project
- [ ] Task assignment to team members
- [ ] Task dependencies (optional)
- [ ] Task templates (reuse across projects)

### 7.4 Timesheets & Time Tracking

- [ ] **Timesheet** model (user, entries[])
- [ ] **Timesheet Entry** embedded (project, task, date, start_time, end_time, duration, notes, is_billable, billing_rate, billing_amount)
- [ ] **Timer widget** (start/stop/pause time tracking)
  - Available on web app, mobile app, and as browser extension
- [ ] Manual time entry
- [ ] **Timesheet approval workflow**:
  - Internal approval (manager approves staff timesheets)
  - Customer approval (client approves hours before billing)
- [ ] Weekly timesheet view (day-by-day grid)
- [ ] Overtime tracking

### 7.5 Project Billing

- [ ] **Invoice from Project** (bill customer for time + expenses)
- [ ] Billing methods:
  - **Fixed Cost** billing (invoice fixed amount)
  - **Time & Materials** (invoice based on hours logged + expenses)
  - **Task-based** (invoice per task completion)
- [ ] Billable vs non-billable time/expenses
- [ ] **Project Retainer Invoice** (advance payment for project)
- [ ] Apply retainer to project invoices
- [ ] Track billed vs unbilled amounts

### 7.6 Project Expenses

- [ ] Link expenses to projects
- [ ] Billable project expenses → add to customer invoice
- [ ] Non-billable expenses → track for profitability analysis
- [ ] Expense approval within project context

### 7.7 Project Profitability

- [ ] **Project Profitability Report**:
  - Revenue (invoices + retainers)
  - Costs (time cost + expenses)
  - Profit margin per project
- [ ] Identify high-profit and loss-making projects
- [ ] Resource utilization analysis
- [ ] Compare across projects

### 7.8 Project Reports

- [ ] Project Summary
- [ ] Project Profitability
- [ ] Budget vs Actuals
- [ ] Time Entries by Project / Task / Staff
- [ ] Timesheet Billing Summary
- [ ] Logged Hours per Staff member
- [ ] Unbilled Hours/Expenses

### Deliverables

- Full project management (create, track, close)
- Task management with assignment and tracking
- Time tracking with timer and manual entry
- Timesheet approval (internal + customer)
- Project billing (fixed, time-based, task-based)
- Project budgeting with budget vs actuals
- Project profitability analysis
- All project reports

---

## Phase 8: Core Accounting Engine & Accountant Tools (Week 29-33)

> **Goal**: Double-entry General Ledger, Journal Entries, Fixed Assets, Budgeting, Currency Adjustments, Transaction Locking — everything an accountant needs.

### 8.1 General Ledger Engine

- [ ] **GL Entry** model (account, debit, credit, voucher_type, voucher_no, posting_date, organization, contact_type, contact, currency, exchange_rate, description)
- [ ] GL posting service — core engine that creates balanced double-entry records
- [ ] Validation: total debits must equal total credits per voucher
- [ ] Auto-reverse GL entries on void/cancel
- [ ] Party-wise GL entries (customer/vendor sub-ledger)
- [ ] Multi-currency GL entries (with exchange rate, base currency conversion)
- [ ] GL entries auto-created from: Invoices, Bills, Payments, Expenses, Adjustments, Journals, Depreciation, Payroll

### 8.2 Manual Journal Entries

- [ ] **Journal Entry** model (date, reference, entries[], notes, status [Draft/Published])
- [ ] **Journal Entry Line** embedded (account, contact, debit, credit, description)
- [ ] Journal Entry form:
  - Add multiple debit/credit lines
  - Auto-balance detection (show difference)
  - Attach supporting documents
- [ ] Use cases:
  - Non-routine adjustments
  - Asset depreciation
  - Bad debt write-off
  - Accrued revenue/expenses
  - Opening balance entries
  - Year-end closing entries
- [ ] Recurring journal entries
- [ ] Journal entry templates

### 8.3 Fixed Asset Management

- [ ] **Fixed Asset** model (name, asset_number, category, purchase_date, purchase_price, residual_value, useful_life, depreciation_method, current_value, status [Active/Fully Depreciated/Sold/Disposed])
- [ ] **Asset Category** model (default depreciation method, useful life, accounts)
- [ ] Depreciation methods:
  - **Straight Line**
  - **Declining Balance** (Written Down Value)
  - **Double Declining Balance**
  - Custom percentage
- [ ] **Auto-calculate depreciation** schedule on asset creation
- [ ] **Auto-post depreciation** journal entries (scheduled monthly/yearly)
- [ ] **Asset Lifecycle**:
  - Purchase → Active → Depreciation → Disposal/Sale
  - Create asset from Purchase Bill
  - GL posting at every stage
- [ ] **Asset Disposal** (sale or scrap):
  - Record sale amount
  - Calculate gain/loss on disposal
  - GL entries for disposal
- [ ] **Asset Reports**:
  - Fixed Asset Register
  - Asset Depreciation Schedule
  - Asset Disposal Report
  - Asset Summary

### 8.4 Base Currency Adjustments

- [ ] **Currency Adjustment** for foreign currency balances at period end
- [ ] Calculate unrealized exchange gain/loss per foreign currency account
- [ ] Auto-create journal entries for exchange differences
- [ ] Track adjusted vs unadjusted balances

### 8.5 Budgeting

- [ ] **Budget** model (name, fiscal_year, period [Monthly/Quarterly/Annual], accounts[])
- [ ] **Budget Line** embedded (account, jan, feb, mar, ..., dec, total)
- [ ] Set budgets for:
  - Income accounts (revenue targets)
  - Expense accounts (spending limits)
  - Any other account
- [ ] **Budget alerts** (warn when approaching or exceeding budget)
- [ ] **Budget vs Actuals** report:
  - Month-by-month comparison
  - Variance analysis (absolute + percentage)
  - Dashboard visualization

### 8.6 Transaction Locking (Period Closing)

- [ ] **Transaction Lock** model (lock_date, locked_by, reason)
- [ ] Lock transactions before a specific date (prevent edits)
- [ ] Lock for audit/tax filing preparation
- [ ] Admin override for locked periods
- [ ] Lock per module or global lock

### 8.7 Opening Balances

- [ ] **Opening Balance** import wizard
- [ ] Set opening balances for:
  - All GL accounts
  - Customer/vendor outstanding invoices
  - Bank accounts
  - Inventory
- [ ] Migration date setting
- [ ] Validation (trial balance must balance)

### 8.8 Account Closing

- [ ] Year-end closing process
- [ ] Transfer P&L balances to Retained Earnings
- [ ] Generate closing journal entries
- [ ] Lock closed fiscal year

### Deliverables

- Full double-entry General Ledger engine
- Manual journal entries with templates
- Fixed asset management with auto-depreciation
- Base currency adjustments
- Budgeting with budget vs actuals
- Transaction locking (period closing)
- Opening balance import
- Year-end closing

---

## Phase 9: Reports & Business Intelligence (Week 34-38)

> **Goal**: 70+ built-in reports, custom reports, reporting tags, divisional reports, scheduled reports, and advanced analytics — matching Zoho Books' comprehensive reporting.

### 9.1 Business Financial Reports

- [ ] **Profit and Loss (P&L)** Statement
  - Date range filter (this month, quarter, year, custom)
  - Comparison: previous period, previous year, budget
  - Drill-down to individual transactions
  - Cash basis vs accrual basis toggle
- [ ] **Balance Sheet**
  - Point-in-time snapshot
  - Previous period comparison
  - Drill-down capability
- [ ] **Cash Flow Statement**
  - Operating / Investing / Financing activities
  - Indirect method
- [ ] **Trial Balance**
  - Opening + Debit + Credit + Closing
  - Filter by date range
- [ ] **Equity / Movement of Equity** report

### 9.2 Sales Reports (Receivables)

- [ ] Sales by Customer
- [ ] Sales by Item
- [ ] Sales by Sales Person
- [ ] Invoice Details
- [ ] Sales Order Fulfillment
- [ ] Quote Conversion Rate
- [ ] Credit Note Details
- [ ] Retainer Invoice Summary
- [ ] Receivable Summary (current, 1-30, 31-60, 61-90, 90+ days)
- [ ] Receivable Details
- [ ] Customer Balance Summary
- [ ] Invoice Ageing Report
- [ ] Time to Get Paid report

### 9.3 Purchase Reports (Payables)

- [ ] Purchases by Vendor
- [ ] Purchases by Item
- [ ] Bill Details
- [ ] Purchase Order Details
- [ ] Vendor Credit Details
- [ ] Payable Summary (ageing: current, 1-30, 31-60, 61-90, 90+ days)
- [ ] Payable Details
- [ ] Vendor Balance Summary
- [ ] Bill Ageing Report

### 9.4 Expense Reports

- [ ] Expenses by Category
- [ ] Expenses by Employee (Staff)
- [ ] Expenses by Vendor
- [ ] Expenses by Project
- [ ] Expense Details
- [ ] Billable Expenses Summary
- [ ] Mileage Report

### 9.5 Inventory Reports

- [ ] Inventory Summary (current stock + value)
- [ ] Inventory Valuation Summary (FIFO / Weighted Average)
- [ ] Stock Movement Report
- [ ] FIFO Cost Lot Tracking
- [ ] Product Sales Report
- [ ] Active Items
- [ ] Warehousing Details
- [ ] ABC Analysis

### 9.6 Project Reports

- [ ] Project Summary
- [ ] Project Profitability
- [ ] Budget vs Actuals
- [ ] Time Entries by Project / Staff / Task
- [ ] Timesheet Billing Summary
- [ ] Unbilled Time and Expenses

### 9.7 Tax Reports

- [ ] Tax Summary
- [ ] Tax Liability Report
- [ ] GSTR-1 Report
- [ ] GSTR-3B Report
- [ ] HSN Summary
- [ ] TDS Summary
- [ ] Sales Tax Summary (US)
- [ ] VAT Return (UAE/UK)

### 9.8 Payroll Reports

- [ ] Payroll Summary
- [ ] Employee Pay Summary
- [ ] Payroll Tax Summary
- [ ] YTD Earnings Report

### 9.9 Bank & Cash Reports

- [ ] Bank Transaction Report
- [ ] Reconciliation Summary
- [ ] Cash Flow Forecast
- [ ] Bank Balance Trend

### 9.10 Accountant Reports

- [ ] General Ledger
- [ ] Chart of Accounts Summary
- [ ] Journal Entry Report
- [ ] Trial Balance
- [ ] Day Book (all transactions for a day)
- [ ] Account Transaction Report

### 9.11 Reporting Tags & Divisional Reports

- [ ] **Reporting Tags** (associate tags with contacts, items, transactions)
- [ ] **Tag-wise P&L** (profit and loss per tag/division/cost center)
- [ ] **Tag-wise Balance Sheet**
- [ ] Multiple simultaneous tags on transactions
- [ ] Use cases: cost centers, revenue streams, departments, branches, locations

### 9.12 Custom Reports

- [ ] **Custom Report Builder**:
  - Select base entity (invoices, bills, items, contacts, etc.)
  - Add/remove columns
  - Apply filters (date range, status, contact, amount range, etc.)
  - Group by any field
  - Aggregate functions (sum, count, average, min, max)
  - Sort by any column
- [ ] **Save custom reports** for quick access
- [ ] **Share reports** with team members with access controls

### 9.13 Report Export & Sharing

- [ ] Export all reports to:
  - **PDF** (with optional password protection)
  - **Excel** (XLSX)
  - **CSV**
- [ ] **Schedule report emails** (daily, weekly, monthly to select recipients)
- [ ] **Report dashboard** (pin favorite reports)
- [ ] **Grant report access** per user role

### 9.14 Advanced Business Intelligence

- [ ] Dashboard with KPI widgets:
  - Total Revenue (this month/quarter/year)
  - Total Expenses
  - Net Profit
  - Cash in bank
  - Receivables outstanding
  - Payables outstanding
  - Top 5 customers
  - Top 5 items
  - Revenue trend chart
  - Expense breakdown pie chart
  - Cash flow trend
  - Receivable/Payable ageing bar chart
- [ ] Compare across time periods
- [ ] Drill-down from any chart to underlying data
- [ ] Custom dashboard creation

### Deliverables

- 70+ built-in reports across all modules
- Custom report builder with save/share
- Reporting tags for divisional P&L
- Financial statements (P&L, BS, Cash Flow, Trial Balance)
- Ageing reports (AR/AP)
- Report export (PDF, Excel, CSV)
- Scheduled report emails
- Advanced BI dashboards

---

## Phase 10: Payroll (Week 39-42)

> **Goal**: Integrated payroll processing with tax compliance, pay runs, payslips, and accounting integration.

### 10.1 Employee Management

- [ ] **Employee** model (name, email, employee_id, department, designation, joining_date, salary_components, bank_details, tax_details [PAN, PF number], leave_balance)
- [ ] Employee onboarding wizard
- [ ] Employee list with department/status filters
- [ ] Employee detail page with pay history

### 10.2 Salary Components

- [ ] **Salary Component** model (name, type [Earning/Deduction], calculation [Fixed/Percentage], is_taxable)
- [ ] Earnings: Basic, HRA, DA, Special Allowance, Bonus, Overtime, Commission
- [ ] Deductions: PF (Provident Fund), ESI, Professional Tax, TDS, Loan Recovery
- [ ] Employer contributions: Employer PF, Employer ESI
- [ ] Flexible component configuration per employee

### 10.3 Salary Structure

- [ ] **Salary Structure** model (name, components[], frequency [Monthly/Weekly])
- [ ] Salary structure templates
- [ ] Assign salary structure to employees
- [ ] CTC (Cost to Company) breakdown

### 10.4 Pay Runs

- [ ] **Pay Run** model (period, department, employees[], status [Draft/Processed/Approved/Paid])
- [ ] Pay run form:
  - Select period (month/week) and department
  - Auto-calculate salary for all employees
  - Review individual payslips
  - Approve pay run
  - Process payments (bank transfer / cheque)
- [ ] **Payslip** model per employee per pay run (earnings[], deductions[], net_pay, gross_pay)
- [ ] GL posting on pay run approval:
  - Debit: Salary Expense (per component)
  - Credit: Bank/Cash Account (net pay)
  - Credit: Statutory Liability accounts (PF, ESI, TDS)

### 10.5 Tax Compliance (Payroll)

- [ ] **Income Tax** calculation (India: old regime vs new regime)
- [ ] **TDS** deduction per pay period
- [ ] **PF** (Provident Fund) calculation and compliance
- [ ] **ESI** (Employee State Insurance) calculation
- [ ] **Professional Tax** per state
- [ ] Tax declaration by employee (investment proofs)
- [ ] **Form 16** generation (India)

### 10.6 Leave Management

- [ ] **Leave Type** model (Earned Leave, Sick Leave, Casual Leave, etc.)
- [ ] **Leave Application** model (employee, type, from_date, to_date, status)
- [ ] Leave balance tracking
- [ ] Leave approval workflow
- [ ] Loss of Pay (LOP) calculation for absent days

### 10.7 Reimbursements

- [ ] Employee expense reimbursement via payroll
- [ ] Reimbursement approval workflow
- [ ] Include in payslip

### 10.8 Payroll Reports

- [ ] Payroll Summary (organization-wise)
- [ ] Employee Pay Summary
- [ ] Payroll Tax Summary
- [ ] YTD (Year-to-Date) Earnings
- [ ] Department-wise Payroll
- [ ] PF/ESI Reports for filing
- [ ] Bank advice (payment file for bank upload)

### Deliverables

- Employee management
- Salary configuration with components
- Pay run processing with approval
- Payslip generation
- Payroll tax compliance (TDS, PF, ESI)
- Leave management
- GL posting for payroll
- All payroll reports

---

## Phase 11: Collaboration — Customer & Vendor Portals (Week 43-45)

> **Goal**: Self-service portals for customers and vendors + internal team collaboration tools.

### 11.1 Customer Portal

- [ ] **Customer Portal** (dedicated self-service web app)
- [ ] Customer portal features:
  - View and accept/decline **Quotes**
  - Comment/negotiate on quotes (back-and-forth in comments)
  - View **Invoices** and payment history
  - Make **online payments** directly
  - Download invoice/quote PDFs
  - View **Statements of Account**
  - View **Project** progress and timesheet details
  - **Approve timesheets** before billing (customer approval)
  - Upload documents
  - Update contact information
- [ ] Portal branding (organization logo, colors)
- [ ] Invite customers via email
- [ ] Customer-specific language preference in portal
- [ ] Portal permissions (what customers can see/do)

### 11.2 Vendor Portal

- [ ] **Vendor Portal** (dedicated self-service web app)
- [ ] Vendor portal features:
  - Receive and view **Purchase Orders**
  - Track **Bill payment status** (when will they get paid)
  - Upload **invoices** (auto-convert to Bills in the system)
  - **Communicate** in real-time (comments on POs/bills)
  - View payment history
  - Update vendor information, banking details
- [ ] Portal branding
- [ ] Invite vendors via email

### 11.3 Accountant Access

- [ ] **Accountant role** with dedicated permissions
- [ ] Invite external accountant (separate from team)
- [ ] Accountant can access:
  - Chart of Accounts and journal entries
  - Base currency adjustments
  - Bank reconciliation
  - All reports
  - Transaction locking
  - Year-end closing
- [ ] Accountant access from anywhere (cloud-based)
- [ ] Accountant can manage multiple organizations (practice management)

### 11.4 Team Collaboration

- [ ] **Comments** on any transaction (invoice, bill, quote, etc.)
- [ ] **@mention** team members in comments
- [ ] **Task management** for accounting tasks
- [ ] **Task assignment** with priority and due dates
- [ ] **Task tagging** (link tasks to contacts, items, transactions)
- [ ] **Activity feed** (recent changes, assignments, comments)
- [ ] In-app notifications for mentions, assignments, approvals
- [ ] Email notifications (configurable)

### 11.5 Communication

- [ ] Send emails directly from transactions (invoices, quotes, POs)
- [ ] Email tracking (sent, opened, bounced)
- [ ] Email templates per document type
- [ ] Built-in comment/discussion on every transaction

### Deliverables

- Customer Portal (view, accept, pay, comment)
- Vendor Portal (receive POs, upload invoices, track payments)
- Accountant access with full permissions
- Team collaboration (comments, tasks, mentions)
- Communication via email from transactions
- Portal branding and customization

---

## Phase 12: Workflow Automation (Week 46-48)

> **Goal**: Automate repetitive accounting tasks — recurring transactions, auto-conversions, payment reminders, custom workflow triggers.

### 12.1 Recurring Transactions

- [ ] **Recurring Invoice** (auto-create invoices on schedule)
- [ ] **Recurring Bill** (auto-create bills on schedule)
- [ ] **Recurring Expense** (auto-record recurring expenses)
- [ ] **Recurring Journal Entry** (auto-post journals)
- [ ] Configuration: frequency, start/end date, auto-send option
- [ ] Notification before auto-creation
- [ ] Recurring transaction management page (view all, pause, resume, stop)

### 12.2 Auto-Conversion

- [ ] Quote → Invoice auto-conversion on acceptance
- [ ] Quote → Sales Order auto-conversion
- [ ] Sales Order → Invoice auto-conversion on fulfillment
- [ ] Purchase Order → Bill auto-conversion on receipt
- [ ] Expense → Invoice (billable expense to customer invoice)

### 12.3 Payment Reminders

- [ ] **Automated payment reminders** for overdue invoices
- [ ] Configure reminder schedule (X days before/after due date)
- [ ] Customizable reminder email templates
- [ ] Escalation (multiple reminders at intervals)
- [ ] Reminder history tracking
- [ ] Pause reminders per customer/invoice

### 12.4 Auto-Charge

- [ ] **Auto-charge saved cards** for recurring invoices
- [ ] Payment gateway integration for auto-charge
- [ ] Failed charge retry logic
- [ ] Customer notification on charge

### 12.5 Custom Workflow Rules

- [ ] **Workflow Rule** model (trigger, conditions[], actions[])
- [ ] Triggers:
  - When a record is created
  - When a record is edited
  - When a field is updated
  - Time-based (e.g., 3 days after due date)
  - On a specific date field
- [ ] Conditions: field-based (status = X, amount > Y, customer = Z)
- [ ] Actions:
  - **Send email** (to contact, to user, to custom address)
  - **Send webhook** (POST to external URL)
  - **Update field** (change status, add tag, etc.)
  - **Create task** (auto-assign to user)
  - **Send notification** (in-app)
- [ ] Workflow rule management page
- [ ] Workflow execution log

### 12.6 Approval Workflows

- [ ] **Approval Rule** model (entity_type, conditions, approvers[], approval_type [Single/Sequential/Parallel])
- [ ] All supported entities: Quotes, Invoices, Sales Orders, Bills, Purchase Orders, Credit Notes, Vendor Credits, Expenses
- [ ] Single-level approval (one approver)
- [ ] Multi-level approval (sequential chain: Level 1 → Level 2 → Level 3)
- [ ] Approval delegation (auto-forward if approver unavailable)
- [ ] Approve/reject with comments
- [ ] Approval history and audit trail

### 12.7 Scheduled Jobs

- [ ] **Daily**: Flag overdue invoices, send reminders, auto-depreciation, sync exchange rates, process recurring transactions
- [ ] **Weekly**: Summary reports, bank feed sync
- [ ] **Monthly**: Process recurring transactions, payroll reminders, budget vs actual alerts
- [ ] Job monitoring dashboard
- [ ] Job failure alerts

### Deliverables

- Recurring transactions (invoices, bills, expenses, journals)
- Auto-conversion between document types
- Automated payment reminders with escalation
- Auto-charge for recurring payments
- Custom workflow rules (trigger → condition → action)
- Multi-level approval workflows
- All scheduled jobs

---

## Phase 13: Customization (Week 49-50)

> **Goal**: Allow organizations to customize the system to their unique business needs — custom fields, templates, reports, and processes.

### 13.1 Custom Fields

- [ ] **Custom Field** engine (add custom fields to any entity)
- [ ] Field types: Text, Number, Dropdown, Date, Checkbox, URL, Email, Phone, Lookup, Multi-select
- [ ] Custom fields appear in:
  - Forms (create/edit)
  - Detail views
  - List views (optional)
  - Print templates (optional)
  - Reports / filters
- [ ] Custom field validation rules
- [ ] Required/optional toggle
- [ ] Default values
- [ ] Custom field management UI

### 13.2 Custom Templates (Print/Email)

- [ ] **Invoice template** customization (layout, colors, fonts, logo, sections)
- [ ] **Quote template** customization
- [ ] **Sales Order / Purchase Order** template customization
- [ ] **Email template** customization per document type
- [ ] Template variables (dynamic data placeholders)
- [ ] Multiple templates per document type
- [ ] Template preview before sending
- [ ] HTML/drag-and-drop template editor

### 13.3 Custom Numbering / Naming Series

- [ ] Configure prefix for each document type (INV-, QUO-, SO-, PO-, BILL-, etc.)
- [ ] Starting number configuration
- [ ] Pattern support: `{prefix}{YYYY}{MM}{#####}`
- [ ] Per-organization numbering

### 13.4 Custom Reports (refer Phase 9.12)

- [ ] Custom report builder (from Phase 9)
- [ ] Save, share, and schedule custom reports

### 13.5 Custom Modules / Preferences

- [ ] Enable/disable modules per organization (e.g., disable Inventory if service-only business)
- [ ] Custom sidebar navigation order
- [ ] Custom dashboard widgets
- [ ] Custom status labels (rename statuses)

### Deliverables

- Custom fields on any entity
- Custom print/email templates
- Custom numbering patterns
- Module enable/disable per organization
- Template editor (HTML)

---

## Phase 14: Global Features — Multi-Currency & Multi-Language (Week 51-52)

> **Goal**: Full multi-currency and multi-language support for businesses operating globally.

### 14.1 Multi-Currency Transactions

- [ ] Every transaction (invoice, bill, payment, etc.) supports:
  - Transaction currency (customer's/vendor's currency)
  - Base currency (organization's currency)
  - Exchange rate (auto-fetched or manually entered)
  - Auto-conversion to base currency for GL posting
- [ ] Realized exchange gain/loss on payments
- [ ] Unrealized exchange gain/loss (base currency adjustment)
- [ ] **Currency Exchange Rate** auto-fetch (daily scheduled job)
- [ ] Exchange rate override per transaction
- [ ] Multi-currency AR/AP reports
- [ ] Multi-currency bank accounts

### 14.2 Multi-Language

- [ ] 25+ UI languages:
  - English, Hindi, Tamil, Telugu, Marathi, Bengali, Gujarati, Kannada
  - Spanish, French, German, Italian, Portuguese
  - Arabic, Chinese (Simplified), Chinese (Traditional), Japanese, Korean
  - Dutch, Swedish, Norwegian, Danish, Finnish
  - Turkish, Indonesian, Thai, Vietnamese
- [ ] Per-user language preference (UI language)
- [ ] Per-organization default language
- [ ] **Per-contact language preference** (documents sent in their language)
- [ ] Multi-language transaction PDFs (invoices, quotes, POs in customer's language)
- [ ] Multi-language email templates
- [ ] Multi-language customer/vendor portal

### 14.3 Multi-Organization / Multi-Branch

- [ ] Switch between organizations from header
- [ ] **Consolidated reports** across multiple organizations
- [ ] Inter-organization transactions
- [ ] Branch management within organization

### Deliverables

- Full multi-currency support with exchange gain/loss
- 25+ language support (UI + documents + portals)
- Per-contact language for outgoing documents
- Multi-organization with consolidated reporting

---

## Phase 15: Integrations (Week 53-55)

> **Goal**: Connect with payment gateways, third-party apps, and banking partners.

### 15.1 Payment Gateways

- [ ] **Stripe** integration (accept online payments)
- [ ] **Razorpay** integration (India-focused)
- [ ] **PayPal** integration
- [ ] **GoCardless** (direct debit)
- [ ] Payment link generation on invoices
- [ ] Auto-record payments on gateway confirmation (webhooks)
- [ ] Refund processing via gateway

### 15.2 Banking Integrations

- [ ] **Plaid** / **Yodlee** for bank feed aggregation
- [ ] Partner bank APIs for direct payment (NEFT/RTGS/IMPS/UPI)
- [ ] Bank file import (CSV, OFX, MT940)

### 15.3 Communication Integrations

- [ ] **Email** (SMTP / SendGrid / Mailgun) for transactional emails
- [ ] **SMS** notifications (Twilio / MSG91) for payment reminders
- [ ] **WhatsApp Business** for invoice delivery (optional)

### 15.4 Cloud Storage

- [ ] **Google Drive** integration for document backup
- [ ] **Dropbox** integration
- [ ] **OneDrive** integration

### 15.5 eCommerce (Future)

- [ ] **Shopify** order sync
- [ ] **WooCommerce** order sync
- [ ] **Amazon** order sync
- [ ] Auto-create invoices from eCommerce orders
- [ ] Inventory sync with eCommerce platforms

### 15.6 CRM Integration (Future)

- [ ] Integration with CRM systems
- [ ] Sync contacts, deals → quotes/invoices
- [ ] Auto-push financial data to CRM

### 15.7 API & Webhooks

- [ ] **REST API** for all entities (CRUD + list + reports)
- [ ] API authentication (API keys + OAuth)
- [ ] Rate limiting per API key
- [ ] **Webhooks** (push events on create/update/delete to external URLs)
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Developer portal

### Deliverables

- Payment gateway integrations (Stripe, Razorpay, PayPal)
- Banking feed integrations
- Email/SMS notifications
- REST API for all entities with docs
- Webhook system
- Cloud storage integrations

---

## Phase 16: Security & Privacy (Week 56-57)

> **Goal**: Enterprise-grade security, privacy compliance, and audit controls.

### 16.1 User Roles & Permissions

- [ ] Predefined roles: Admin, Accountant, Accounts Receivable, Accounts Payable, Staff, Time Tracker
- [ ] **Custom Roles** — define granular module-level permissions
- [ ] Permissions per module: View, Create, Edit, Delete, Approve, Export
- [ ] Data-level access control (e.g., see only assigned projects)
- [ ] Role assignment and management UI
- [ ] Two-factor authentication (via Firebase Auth)

### 16.2 Audit Trail

- [ ] **Tamper-proof audit trail** for all transactions
- [ ] Track: who created, who edited, what was changed, when
- [ ] Field-level change history (old value → new value)
- [ ] Activity report per user
- [ ] Activity log per contact / item / transaction
- [ ] Audit trail cannot be deleted or modified
- [ ] Export audit trail

### 16.3 Data Privacy (GDPR / HIPAA / PCI)

- [ ] **GDPR compliance**:
  - Data export on request (right to access)
  - Data deletion on request (right to be forgotten)
  - Consent management
  - Privacy policy acknowledgment
- [ ] **HIPAA compliance** (for healthcare businesses):
  - Protected Health Information (PHI) safeguards
  - Access controls and audit logging
- [ ] **PCI compliance** (for payment data):
  - Never store raw card data (use tokenization via payment gateway)
  - PCI-DSS Self-Assessment readiness
- [ ] Data encryption at rest (MongoDB Atlas encryption)
- [ ] Data encryption in transit (TLS/SSL)
- [ ] Data retention policies

### 16.4 Security Features

- [ ] Input sanitization on all endpoints
- [ ] Rate limiting per user/IP
- [ ] CORS configuration
- [ ] Security headers (Helmet.js)
- [ ] Dependency vulnerability scanning (npm audit, Snyk)
- [ ] IP whitelisting (optional)
- [ ] Session management
- [ ] Suspicious activity alerts

### Deliverables

- Custom role builder with granular permissions
- Tamper-proof audit trail
- GDPR, HIPAA, PCI readiness
- Enterprise security features
- Data encryption (at rest + in transit)

---

## Phase 17: Printing, PDF & Email (Week 58-59)

> **Goal**: Professional document output with custom branding.

### 17.1 Print Formats / PDF Templates

- [ ] **Invoice** print template (professional, itemized, with tax breakdown)
- [ ] **Quote** print template
- [ ] **Sales Order** / **Purchase Order** print template
- [ ] **Bill** print template
- [ ] **Payment Receipt** print template
- [ ] **Credit Note** / **Vendor Credit** print template
- [ ] **Delivery Challan** print template
- [ ] **Customer Statement** print template
- [ ] **Payslip** print template
- [ ] **Journal Entry** print template
- [ ] **Fixed Asset** depreciation schedule print
- [ ] **Cheque** print template

### 17.2 Template Customization

- [ ] Organization logo and branding on all templates
- [ ] Custom colors, fonts, footer text
- [ ] Custom header/footer with address, phone, tax ID
- [ ] Multiple template designs per document type
- [ ] Template editor (HTML + CSS with preview)

### 17.3 PDF Generation

- [ ] Server-side PDF generation (Puppeteer or @react-pdf/renderer)
- [ ] Download PDF from any transaction
- [ ] Bulk PDF generation (e.g., all invoices for a month)
- [ ] **Password-protect PDFs** (optional, for sensitive reports)

### 17.4 Email Sending

- [ ] Send any transaction via email with PDF attachment
- [ ] Customizable email templates per document type
- [ ] Email tracking (sent, delivered, opened — via SendGrid/Mailgun)
- [ ] Reply-to handling (route replies back to app)
- [ ] Batch email sending (e.g., send all overdue reminders at once)

### Deliverables

- Professional print templates for all document types
- Template customization with branding
- PDF generation and download (with password protection)
- Email sending with PDF attachments and tracking

---

## Phase 18: Import/Export & Data Migration (Week 60-61)

> **Goal**: Data portability — import data from other systems, export everything.

### 18.1 Data Import

- [ ] Generic CSV/Excel import for:
  - Contacts (customers, vendors)
  - Items & services
  - Chart of Accounts
  - Invoices (opening invoices)
  - Bills (opening bills)
  - Bank transactions
  - Expenses
  - Opening balances
- [ ] **Import wizard** (map columns, preview, validate, import)
- [ ] Error reporting during import (row-by-row errors)
- [ ] Duplicate detection and handling
- [ ] Import history log

### 18.2 Migration from Other Systems

- [ ] **Tally** import (India-specific)
- [ ] **QuickBooks** import
- [ ] **Zoho Books** import (for users switching platforms)
- [ ] **CSV-based migration** (generic)

### 18.3 Data Export

- [ ] Export any list view to CSV/Excel
- [ ] Export all reports to PDF/Excel/CSV
- [ ] **Full data export** (all organization data for backup)
- [ ] GDPR-compliant data export (per user/contact request)

### 18.4 Bank Statement Import

- [ ] CSV bank statement import
- [ ] OFX/QFX format support
- [ ] MT940 format support
- [ ] PDF bank statement parsing (OCR)
- [ ] Auto-match imported transactions

### 18.5 Backup & Restore

- [ ] Automated daily backups (MongoDB Atlas)
- [ ] Manual backup trigger
- [ ] Point-in-time restore capability
- [ ] Backup download

### Deliverables

- Bulk data import for all entities with wizard
- Migration tools from Tally, QuickBooks
- Data export (CSV, Excel, PDF)
- Bank statement import (CSV, OFX, MT940)
- Backup and restore

---

## Phase 19: Mobile & Cross-Device Access (Week 62-63)

> **Goal**: Accounting on the move — responsive web, PWA, and native app readiness.

### 19.1 Responsive Web App

- [ ] Fully responsive design for all pages (desktop, tablet, mobile)
- [ ] Mobile-optimized forms (invoice creation, expense recording)
- [ ] Mobile-optimized list views with swipe actions
- [ ] Mobile dashboard with key metrics

### 19.2 Progressive Web App (PWA)

- [ ] **Service Worker** for PWA capabilities
- [ ] Install prompt (Add to Home Screen)
- [ ] Offline capability for:
  - Viewing recent transactions
  - Creating expense entries (sync when online)
  - Viewing reports
- [ ] Push notifications (for reminders, approvals, payments)
- [ ] Background sync for offline-created data

### 19.3 Mobile Features

- [ ] **Camera receipt capture** → auto-create expense
- [ ] Timer widget for time tracking (smartphone widget)
- [ ] Quick actions: Create invoice, Record expense, Record payment
- [ ] Barcode/QR scanning for inventory items
- [ ] Mobile-optimized customer/vendor portal

### 19.4 Desktop App (Electron — Future)

- [ ] Electron wrapper for desktop experience
- [ ] System tray icon with quick actions
- [ ] Desktop notifications
- [ ] Keyboard shortcuts

### Deliverables

- Fully responsive web app
- PWA with offline capability
- Receipt camera capture
- Mobile time tracking
- Quick actions on mobile

---

## Phase 20: Testing & Quality Assurance (Ongoing, dedicated Week 64-66)

> **Goal**: Comprehensive test coverage ensuring reliability.

### 20.1 Backend Tests

- [ ] Unit tests for all services (GL engine, tax calculator, currency conversion, etc.)
- [ ] Integration tests for complete workflows:
  - Quote → SO → Invoice → Payment → Reconciliation
  - PO → Bill → Payment
  - Expense → Invoice (billable)
  - Project → Timesheet → Invoice
  - Payroll → Payslip → Payment
- [ ] API endpoint tests for all routes
- [ ] Test fixtures for common scenarios
- [ ] Tax calculation tests (GST, VAT, Sales Tax)

### 20.2 Frontend Tests

- [ ] Component tests (React Testing Library)
- [ ] Form validation tests
- [ ] Report rendering tests
- [ ] Portal functionality tests
- [ ] Responsive design tests

### 20.3 E2E Tests

- [ ] Playwright tests for critical user flows:
  - Full receivables cycle
  - Full payables cycle
  - Bank reconciliation flow
  - Project billing flow
  - Multi-currency transaction
  - Customer/vendor portal interaction
  - Approval workflow flows
  - Recurring transaction processing
- [ ] Cross-browser testing

### 20.4 Performance Testing

- [ ] Load test GL posting with 100K+ entries
- [ ] Report generation performance with large datasets
- [ ] Bank reconciliation with 10K+ transactions
- [ ] Database query optimization
- [ ] Index optimization
- [ ] Caching effectiveness testing

### 20.5 Security Testing

- [ ] Penetration testing
- [ ] OWASP Top 10 compliance check
- [ ] Authentication/authorization boundary testing
- [ ] API rate limiting verification
- [ ] Input sanitization verification

### Deliverables

- > 80% backend test coverage
- E2E tests for all critical workflows
- Performance benchmarks
- Security audit results

---

## Phase 21: Deployment, Scaling & DevOps (Week 67-69)

> **Goal**: Production-ready deployment.

### 21.1 Containerization

- [ ] Docker containerization (frontend + backend + Redis)
- [ ] Docker Compose for local development
- [ ] Kubernetes manifests (for production scaling)
- [ ] Multi-stage Docker builds (optimized images)

### 21.2 CI/CD Pipeline

- [ ] GitHub Actions CI/CD:
  - Lint → Test → Build → Deploy
  - Branch protection rules
  - Automated E2E tests on PR
  - Staging → Production promotion
- [ ] Environment management (dev, staging, production)

### 21.3 Database

- [ ] MongoDB Atlas production cluster setup
- [ ] Database migration system (versioned schema changes)
- [ ] Backup strategy (automated daily + point-in-time recovery)
- [ ] Read replicas for reports (optional)
- [ ] Indexing strategy for large datasets

### 21.4 Monitoring & Observability

- [ ] **Sentry** for error tracking
- [ ] Application Performance Monitoring (APM)
- [ ] Database query monitoring
- [ ] Uptime monitoring (external)
- [ ] Log aggregation (structured logging with pino)
- [ ] Custom alerts (error rate spike, slow queries, etc.)
- [ ] Health check endpoints

### 21.5 Scaling

- [ ] Horizontal scaling (multiple backend instances + load balancer)
- [ ] Redis for session/cache clustering
- [ ] MongoDB Atlas auto-scaling
- [ ] CDN for frontend static assets (Vercel, Cloudflare)
- [ ] Report generation queue (BullMQ for heavy reports)
- [ ] WebSocket scaling (Redis pub/sub for multi-instance)

### 21.6 Security Hardening

- [ ] WAF (Web Application Firewall) setup
- [ ] DDoS protection
- [ ] SSL/TLS certificate management
- [ ] Secret management (environment variables, vault)
- [ ] Regular dependency updates and vulnerability scanning

### Deliverables

- Docker-based deployment
- CI/CD pipeline with automated testing
- Monitoring, alerting, and observability
- Production security hardening
- Horizontal scaling strategy
- 99.9% uptime target

---

## Summary Timeline

| Phase  | Name                              | Duration   | Key Output                                                     |
| ------ | --------------------------------- | ---------- | -------------------------------------------------------------- |
| **0**  | Infrastructure & Foundation       | Week 1-2   | TS backend, RBAC, reusable components, i18n, state management  |
| **1**  | Setup & Master Data               | Week 3-5   | Org, CoA, Contacts, Items, Taxes, Price Lists, Reporting Tags  |
| **2**  | Receivables                       | Week 6-10  | Quotes, Sales Orders, Invoices, Payments, Credit Notes         |
| **3**  | Payables                          | Week 11-14 | POs, Bills, Payments Made, Vendor Credits, Expenses, Documents |
| **4**  | Banking & Reconciliation          | Week 15-17 | Bank feeds, auto-match, reconciliation, connected banking      |
| **5**  | Tax Compliance                    | Week 18-20 | GST, e-invoicing, GSTR returns, TDS/TCS, VAT, US sales tax    |
| **6**  | Inventory & Stock                 | Week 21-24 | Item tracking, valuation, adjustments, packages, shipments     |
| **7**  | Projects & Timesheets             | Week 25-28 | Projects, tasks, timesheets, billing, budgets, profitability   |
| **8**  | Core Accounting & Accountant      | Week 29-33 | GL, journals, fixed assets, budgets, currency adj, locking     |
| **9**  | Reports & BI                      | Week 34-38 | 70+ reports, custom reports, dashboards, reporting tags        |
| **10** | Payroll                           | Week 39-42 | Employees, salary, pay runs, payslips, tax compliance          |
| **11** | Collaboration & Portals           | Week 43-45 | Customer portal, vendor portal, team collaboration, chat       |
| **12** | Workflow Automation               | Week 46-48 | Recurring, reminders, auto-charge, workflows, approvals        |
| **13** | Customization                     | Week 49-50 | Custom fields, templates, numbering, module config             |
| **14** | Global (Currency & Language)      | Week 51-52 | Multi-currency, 25+ languages, multi-org consolidation         |
| **15** | Integrations                      | Week 53-55 | Payment gateways, banking, API, webhooks, eCommerce            |
| **16** | Security & Privacy                | Week 56-57 | Custom roles, audit trail, GDPR, HIPAA, PCI                   |
| **17** | Printing & Email                  | Week 58-59 | PDF templates, branding, email sending, tracking               |
| **18** | Import/Export & Migration         | Week 60-61 | Data import, migration tools, bank statements, backup          |
| **19** | Mobile & Cross-Device             | Week 62-63 | PWA, responsive, receipt capture, offline                      |
| **20** | Testing & QA                      | Week 64-66 | Unit, integration, E2E, performance, security tests            |
| **21** | Deployment & DevOps               | Week 67-69 | Docker, CI/CD, monitoring, scaling, security hardening         |

**Total estimated duration: ~69 weeks (17 months)**

---

## Zoho Books Feature ↔ Phase Mapping

| Zoho Books Feature         | Phase(s)      | Notes                                              |
| -------------------------- | ------------- | -------------------------------------------------- |
| Receivables                | Phase 2       | Quotes, Invoices, SO, Payments, Credit Notes       |
| Payables                   | Phase 3       | Bills, POs, Expenses, Vendor Credits, Documents    |
| Tax Compliance (GST)       | Phase 5       | GST, e-invoicing, GSTR, TDS/TCS, VAT              |
| Bank Reconciliation        | Phase 4       | Bank feeds, matching, reconciliation               |
| Inventory                  | Phase 6       | Items, stock, packages, shipments, adjustments     |
| Projects Accounting        | Phase 7       | Projects, timesheets, billing, budgets             |
| Payroll                    | Phase 10      | Employees, pay runs, tax compliance                |
| Reports (70+)              | Phase 9       | All financial, sales, purchase, tax reports        |
| Collaboration              | Phase 11      | Portals (customer, vendor), team tools             |
| For Accountants            | Phase 8       | CoA, journals, assets, budgets, locking            |
| Workflow Automation        | Phase 12      | Recurring, reminders, rules, approvals             |
| Customization              | Phase 13      | Custom fields, templates, numbering                |
| Scale Globally             | Phase 14      | Multi-currency, multi-language, multi-org          |
| Integrations               | Phase 15      | Payment gateways, banks, API, webhooks             |
| Accounting Across Devices  | Phase 19      | PWA, responsive, mobile receipt capture            |
| Security & Privacy         | Phase 16      | Roles, audit trail, GDPR, HIPAA, PCI              |

---

## Important Notes

1. **Authentication stays untouched**: Firebase Auth (email, Google, phone OTP, magic link) + the existing user model remain as-is. All new modules integrate with the existing auth system.

2. **Zoho Books-focused scope**: Unlike ERPNext (full ERP), this plan focuses on **accounting software** features. No Manufacturing, CRM, Support/Helpdesk modules — those are separate products in Zoho's ecosystem (Zoho Inventory, Zoho CRM, Zoho Desk).

3. **Phases can overlap**: Phases 0-2 are sequential (foundation), but after Phase 2, many phases can run in parallel with different team members.

4. **Testing is continuous**: While Phase 20 is a dedicated QA phase, tests should be written alongside each phase.

5. **Each phase is independently deployable**: The system should be usable after each major phase (especially after Phase 4 — the system can run a basic invoicing + banking business).

6. **MongoDB document model**: Embedded line items (invoice items, bill items), referenced master data (contacts, items, accounts). Careful indexing for report performance.

7. **Progressive Enhancement**: Start with core receivables/payables, add advanced features later. A business should be fully operational after Phase 9 (reports).

8. **Zoho Books parity**: The feature list matches Zoho Books' publicly documented features. Where Zoho Books has integrations with other Zoho products (Zoho CRM, Zoho Inventory, Zoho Desk), we provide API/webhook equivalents for third-party integration.

9. **No ERPNext dependency**: This plan does NOT reference ERPNext. It is designed from scratch following Zoho Books' feature specification and UX paradigms.

10. **Customer & Vendor Portals are first-class**: Unlike ERPNext where portals are secondary, Zoho Books treats self-service portals as core features — customer quote acceptance, online payments, vendor invoice uploads, and real-time communication all happen through dedicated portals.
