# HAI_ACCOUNTING — ERPNext Feature Migration Plan

## Executive Summary

**Goal**: Migrate all ERPNext ERP features (~470 doctypes, ~185 reports, 22 modules) into the HAI_ACCOUNTING project (Next.js 16 + Express 5 + MongoDB + Firebase Auth).

**Current State of HAI_ACCOUNTING**:

- Firebase Auth (email, Google, phone OTP, magic link) — **fully working, stays as-is**
- Express 5 backend with MongoDB Atlas (Mongoose)
- Next.js 16 frontend with shadcn/ui, Tailwind, Recharts, TanStack Table
- Only user model exists; zero accounting logic

**ERPNext Scope Being Migrated**:  
22 modules, ~470 entities, ~185 reports, 15 controller base classes, 30+ scheduled jobs

**Architecture Decision**: We are NOT porting ERPNext's Python/Frappe code. We are **re-implementing** all business logic in Node.js/TypeScript using ERPNext as the feature specification. MongoDB replaces MariaDB, and the Frappe ORM is replaced with Mongoose.

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
| Queue        | BullMQ + Redis (add later)                       | For background jobs (repost, reconciliation) |
| PDF          | Puppeteer or @react-pdf/renderer                 | For invoice/report printing                  |
| File Storage | Firebase Storage or S3                           | For attachments                              |
| Search       | MongoDB Atlas Search                             | For full-text search across entities         |
| Validation   | Zod (shared schemas)                             | Already partially in place                   |
| State Mgmt   | TanStack Query + Zustand                         | Add for proper server state + client state   |
| Real-time    | Socket.io                                        | For live notifications, dashboard updates    |

### Backend Architecture Pattern

```
backend/src/
├── config/              # DB, Firebase, Redis, env configs
├── middlewares/          # Auth, validation, error handling, rate limiting
├── models/              # Mongoose schemas (organized by module)
│   ├── accounts/
│   ├── stock/
│   ├── selling/
│   └── ...
├── routes/              # Express routes (organized by module)
│   ├── accounts/
│   ├── stock/
│   └── ...
├── controllers/         # Request handlers
│   ├── accounts/
│   ├── stock/
│   └── ...
├── services/            # Business logic layer (core engine)
│   ├── accounts/
│   │   ├── general-ledger.service.ts
│   │   ├── tax-calculator.service.ts
│   │   └── ...
│   ├── stock/
│   │   ├── stock-ledger.service.ts
│   │   ├── valuation.service.ts
│   │   └── ...
│   └── ...
├── engines/             # Cross-cutting engines
│   ├── taxes-and-totals.engine.ts
│   ├── status-updater.engine.ts
│   ├── naming-series.engine.ts
│   └── workflow.engine.ts
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
│   │   ├── accounts/
│   │   │   ├── chart-of-accounts/
│   │   │   ├── journal-entry/
│   │   │   ├── payment-entry/
│   │   │   ├── sales-invoice/
│   │   │   ├── purchase-invoice/
│   │   │   └── ...
│   │   ├── stock/
│   │   ├── selling/
│   │   ├── buying/
│   │   ├── manufacturing/
│   │   ├── crm/
│   │   ├── assets/
│   │   ├── projects/
│   │   ├── reports/
│   │   └── setup/
│   └── layout.tsx
├── components/
│   ├── ui/                     # shadcn primitives — EXISTING
│   ├── forms/                  # Reusable form components
│   ├── tables/                 # Reusable table components
│   ├── charts/                 # Dashboard chart components
│   ├── layout/                 # Layout components (sidebar, header, etc.)
│   └── modules/                # Module-specific components
│       ├── accounts/
│       ├── stock/
│       └── ...
├── contexts/                   # React contexts — auth EXISTING
├── hooks/                      # Custom hooks (data fetching, etc.)
├── lib/                        # Utilities, API client, validators
│   ├── api/                    # API client organized by module
│   ├── validators/             # Zod schemas (shared)
│   └── utils/
└── stores/                     # Zustand stores (if needed)
```

### MongoDB Schema Design Principles

1. **Company-scoped**: Every document has a `company` field for multi-company support
2. **Audit trail**: Every document has `createdBy`, `updatedBy`, `createdAt`, `updatedAt`
3. **Soft delete**: `isDeleted` flag instead of hard deletes on transactional data
4. **Status workflow**: `docstatus` (0=Draft, 1=Submitted, 2=Cancelled) on transactional documents
5. **Naming series**: Auto-generated document names (e.g., `SI-2026-00001`)
6. **Indexing strategy**: Compound indexes on frequently queried fields (company + date + status)
7. **Denormalization**: Store frequently accessed names alongside IDs to reduce lookups
8. **Embedded vs Referenced**: Child table items (invoice items, journal entry accounts) are embedded arrays; master data is referenced

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
- [ ] These schemas will be used on both frontend (form validation) and backend (request validation)
- [ ] Set up schema export pattern for frontend consumption

### 0.3 Backend Architecture Setup

- [ ] Create folder structure: `models/`, `routes/`, `controllers/`, `services/`, `engines/`, `jobs/`, `utils/`, `types/`, `validators/`
- [ ] Implement base service class with common CRUD operations
- [ ] Implement base controller class with error handling
- [ ] Create generic validation middleware using Zod
- [ ] Create generic pagination middleware
- [ ] Implement error handling middleware (structured error responses)
- [ ] Add request logging middleware (morgan or pino)
- [ ] Add rate limiting middleware

### 0.4 Core Mongoose Plugins & Utilities

- [ ] Create `auditTrail` plugin (auto-add `createdBy`, `updatedBy` from `req.user`)
- [ ] Create `softDelete` plugin (`isDeleted`, `deletedAt`, `deletedBy`)
- [ ] Create `docStatus` plugin (Draft/Submitted/Cancelled workflow with validation)
- [ ] Create `namingSeries` utility (auto-incrementing document names)
- [ ] Create `companyScoped` plugin (auto-add `company` field, enforce in queries)

### 0.5 Frontend State Management Upgrade

- [ ] Install and configure **TanStack Query** for server state
- [ ] Create API client factory organized by module (`lib/api/accounts.ts`, `lib/api/stock.ts`)
- [ ] Create custom hooks pattern: `useQuery` + `useMutation` wrappers per entity
- [ ] Install **Zustand** for client-side state (sidebar state, filters, UI preferences)
- [ ] Add optimistic updates pattern for common operations

### 0.6 Frontend Reusable Components

- [ ] Build **GenericForm** component (dynamic form rendering from schema)
- [ ] Build **GenericListView** component (table + filters + pagination + search)
- [ ] Build **GenericDetailView** component (document view with status bar + actions)
- [ ] Build **ChildTable** component (editable rows for line items — invoice items, etc.)
- [ ] Build **LinkField** component (searchable select that queries backend for options)
- [ ] Build **CurrencyInput** component (formatted number input with currency symbol)
- [ ] Build **DateRangePicker** component for report filters
- [ ] Build **StatusBadge** component (Draft, Submitted, Cancelled, Paid, Overdue, etc.)
- [ ] Build **TreeView** component (for hierarchical data: Chart of Accounts, Item Group, etc.)
- [ ] Build **PrintView** component (for PDF generation of invoices, reports)

### 0.7 Role-Based Access Control (RBAC)

- [ ] Design role model: `Role`, `RolePermission`, `UserRole`
- [ ] Roles: System Manager, Accounts Manager, Accounts User, Stock Manager, Stock User, Sales Manager, Sales User, Purchase Manager, Purchase User, Manufacturing Manager, Manufacturing User, etc.
- [ ] Permissions: per-entity (read, write, create, delete, submit, cancel, amend)
- [ ] Backend middleware: `authorize('Sales Invoice', 'write')`
- [ ] Frontend: `usePermission('Sales Invoice', 'write')` hook for conditional rendering
- [ ] Add `role` field to User model in MongoDB

### 0.8 Multi-Company Foundation

- [ ] Design Company model (name, abbr, default currency, country, chart of accounts, etc.)
- [ ] Every transactional and master model gets a `company` field
- [ ] Company switcher in sidebar/header
- [ ] Backend: Company context automatically applied to all queries

### Deliverables

- TypeScript backend with proper architecture
- RBAC system integrated with existing Firebase Auth
- Reusable frontend components for forms, lists, trees, child tables
- TanStack Query + Zustand state management
- Multi-company foundation
- Mongoose plugins for audit trail, soft delete, doc status, naming series

---

## Phase 1: Setup & Master Data (Week 3-5)

> **Goal**: Implement all foundational master data that every other module depends on. This is the ERPNext "Setup" module equivalent.

### 1.1 Company Setup

- [ ] **Company** model & CRUD (name, abbr, default currency, country, domain, default accounts)
- [ ] Company creation wizard (first-time setup)
- [ ] Company settings page
- [ ] Company-wise default values

### 1.2 Chart of Accounts

- [ ] **Account** model (name, number, parent, type, root_type [Asset/Liability/Income/Expense/Equity], is_group, company, balance_direction)
- [ ] **Account Category** model
- [ ] Tree view UI for Chart of Accounts (expandable/collapsible hierarchy)
- [ ] Import Chart of Accounts templates (Indian, US GAAP, IFRS standard charts)
- [ ] Add/edit/delete accounts (with validation — can't delete if transactions exist)
- [ ] Account balance display in tree
- [ ] **Chart of Accounts Importer** — CSV/Excel import

### 1.3 Fiscal Year & Accounting Period

- [ ] **Fiscal Year** model (name, start_date, end_date, companies[], is_closed)
- [ ] **Accounting Period** model (closed doctypes per period)
- [ ] **Finance Book** model (for parallel books — tax book, GAAP book)
- [ ] Fiscal year auto-creation
- [ ] Period closing restrictions

### 1.4 Currency & Exchange Rates

- [ ] **Currency** model (name, symbol, fraction, fraction_units, smallest_unit, enabled)
- [ ] **Currency Exchange** model (from, to, date, rate)
- [ ] **Currency Exchange Settings** (auto-fetch rates from API)
- [ ] Multi-currency support foundation in all monetary fields

### 1.5 Customer & Supplier Masters

- [ ] **Customer** model (name, type [Company/Individual], group, territory, default currency, tax ID, credit limits, addresses, contacts)
- [ ] **Customer Group** model (hierarchical tree)
- [ ] **Supplier** model (name, type, group, default currency, tax ID, addresses, contacts)
- [ ] **Supplier Group** model (hierarchical tree)
- [ ] Customer/Supplier list views with search and filters
- [ ] Customer/Supplier detail pages
- [ ] Default accounts per customer/supplier

### 1.6 Item Master

- [ ] **Item** model (code, name, group, UOM, type [Stock/Non-Stock/Service], valuation_method, stock_uom, has_variants, has_serial_no, has_batch_no, is_sales_item, is_purchase_item, etc.)
- [ ] **Item Group** model (hierarchical tree)
- [ ] **UOM** model (Unit of Measure) + **UOM Conversion Factor**
- [ ] **Brand** model
- [ ] **Manufacturer** model
- [ ] Item list view with search and filters
- [ ] Item detail page with all fields
- [ ] **Item Price** model (item, price_list, rate, currency, valid_from, valid_to)
- [ ] **Price List** model (name, currency, buying/selling)
- [ ] **Item Default** (default warehouse, buying/selling cost center, income/expense account per company)
- [ ] **Item Tax Template** (tax rates specific to items)

### 1.7 Warehouse Master

- [ ] **Warehouse** model (name, type, company, parent_warehouse, is_group, account)
- [ ] **Warehouse Type** model
- [ ] Tree view for warehouse hierarchy
- [ ] Warehouse-Account linking

### 1.8 Tax Configuration

- [ ] **Sales Taxes and Charges Template** (name, company, tax_rows[])
- [ ] **Purchase Taxes and Charges Template**
- [ ] **Tax Category** model
- [ ] **Tax Rule** model (auto-apply tax template based on customer/supplier/item)
- [ ] **Tax Withholding Category** (TDS/TCS for India etc.)

### 1.9 Other Setup Masters

- [ ] **Territory** model (hierarchical tree)
- [ ] **Sales Person** model (hierarchical tree)
- [ ] **Sales Partner** model
- [ ] **Branch** model
- [ ] **Department** model (hierarchical tree)
- [ ] **Designation** model
- [ ] **Cost Center** model (hierarchical tree, company-wise)
- [ ] **Mode of Payment** model + Mode of Payment Account
- [ ] **Payment Terms Template** + Payment Term
- [ ] **Terms and Conditions** model
- [ ] **Incoterm** model
- [ ] **Holiday List** model

### 1.10 Settings

- [ ] **Accounts Settings** page (global settings for accounts module)
- [ ] **Stock Settings** page
- [ ] **Selling Settings** page
- [ ] **Buying Settings** page
- [ ] **Global Defaults** page

### 1.11 Naming Series Engine

- [ ] Naming series configuration per doctype
- [ ] Pattern support: `{prefix}-{YYYY}-{#####}`
- [ ] Auto-increment with company-level counters

### Deliverables

- All master data entities with full CRUD + UI
- Tree views for Chart of Accounts, Item Groups, Warehouses, Customer Groups, Supplier Groups, Territories, Cost Centers
- Company setup wizard
- Tax configuration system
- Pricing system (price lists, item prices)
- All data fully company-scoped

---

## Phase 2: Core Accounting Engine (Week 6-10)

> **Goal**: Implement the General Ledger, Journal Entries, and the foundational accounting engine that all financial transactions flow through.

### 2.1 General Ledger Engine

- [ ] **GL Entry** model (account, debit, credit, voucher_type, voucher_no, posting_date, company, cost_center, project, against, party_type, party, finance_book, is_cancelled, fiscal_year)
- [ ] GL posting service (`makeGLEntries()`) — the core engine that creates balanced double-entry records
- [ ] Validation: total debits must equal total credits per voucher
- [ ] Auto-reverse GL entries on cancellation
- [ ] Party-wise GL entries (customer/supplier sub-ledger)
- [ ] Cost center allocation
- [ ] Multi-currency GL entries (with exchange rate, debit/credit in account currency + company currency)
- [ ] Finance book support (parallel GL entries)
- [ ] **Account Closing Balance** model (periodic balance snapshots for fast reporting)

### 2.2 Payment Ledger Engine

- [ ] **Payment Ledger Entry** model (tracks outstanding amounts for invoices/payments)
- [ ] Payment ledger posting on invoice submission
- [ ] Payment ledger update on payment reconciliation
- [ ] Outstanding amount tracking per invoice

### 2.3 Journal Entry

- [ ] **Journal Entry** model (voucher_type [Journal Entry, Bank Entry, Cash Entry, Credit Note, Debit Note, Contra Entry, Excise Entry, Write Off Entry, Opening Entry, Depreciation Entry, Exchange Rate Revaluation], posting_date, accounts[], total_debit, total_credit, difference, user_remark, cheque_no, cheque_date)
- [ ] **Journal Entry Account** child (account, party_type, party, debit, credit, cost_center, project, reference_type, reference_name, exchange_rate)
- [ ] Journal Entry form with dynamic account rows
- [ ] Auto-balance detection
- [ ] Submit/Cancel workflow with GL posting
- [ ] Quick Entry templates (common journal types)
- [ ] **Journal Entry Template** for recurring entries

### 2.4 Payment Entry

- [ ] **Payment Entry** model (payment_type [Receive/Pay/Internal Transfer], party_type, party, paid_amount, received_amount, source_exchange_rate, target_exchange_rate, references[], deductions[], mode_of_payment, paid_from, paid_to)
- [ ] **Payment Entry Reference** child (reference_doctype, reference_name, outstanding_amount, allocated_amount)
- [ ] **Payment Entry Deduction** child (account, cost_center, amount)
- [ ] Payment Entry form with:
  - Party selection → auto-fetch outstanding invoices
  - Allocate payment against invoices
  - Multi-currency support
  - Write-off handling
  - Bank charges deduction
- [ ] Submit/Cancel with GL posting + Payment Ledger update
- [ ] **Advance Payment** support (payment before invoice)

### 2.5 Bank & Cash Account Management

- [ ] **Bank** model + **Bank Account** model
- [ ] **Bank Account Type** + **Bank Account Subtype**
- [ ] Bank account reconciliation view
- [ ] **Bank Transaction** model (imported or manually entered)
- [ ] **Bank Reconciliation Tool** — match bank transactions to Payment Entries / Journal Entries
- [ ] **Bank Clearance** tool
- [ ] **Bank Statement Import** (CSV/OFX/MT940 parsing)
- [ ] **Bank Guarantee** tracking

### 2.6 Taxes & Totals Engine

- [ ] Port `taxes_and_totals.py` → `taxes-and-totals.engine.ts`
- [ ] Tax calculation types: On Net Total, On Previous Row Amount, On Previous Row Total, On Item Quantity, Actual
- [ ] Inclusive/exclusive tax handling
- [ ] Rounding adjustments
- [ ] Discount handling (percentage + amount, on grand total + net total)
- [ ] This engine is shared by: Sales Invoice, Purchase Invoice, Quotation, Sales Order, Purchase Order, Delivery Note, Purchase Receipt

### 2.7 Period Closing

- [ ] **Period Closing Voucher** — close a fiscal period, move P&L balances to retained earnings
- [ ] **Process Period Closing Voucher** — background processing for large datasets
- [ ] Prevent transactions in closed periods

### 2.8 Budget Management

- [ ] **Budget** model (company, fiscal_year, budget_against [Cost Center/Project/Account/Department], accounts[])
- [ ] **Budget Account** child (account, budget_amount, monthly_distribution)
- [ ] **Monthly Distribution** model (percentage allocation across months)
- [ ] Budget validation on transaction submission (warn/stop/ignore)
- [ ] Budget variance tracking

### 2.9 Accounting Dimensions

- [ ] **Accounting Dimension** model (custom dimensions beyond cost center/project)
- [ ] Auto-add dimension fields to all relevant transactional documents
- [ ] Dimension-wise filtering in reports

### Deliverables

- Fully functional double-entry General Ledger engine
- Journal Entry with submit/cancel workflow
- Payment Entry with invoice allocation
- Bank reconciliation tools
- Tax calculation engine
- Period closing
- Budget management
- Accounting dimensions
- All GL postings validated and balanced

---

## Phase 3: Selling Cycle (Week 11-14)

> **Goal**: Implement the complete selling workflow from CRM lead to payment collection.

### 3.1 CRM Foundation

- [ ] **Lead** model (name, email, phone, company, source, status, territory, notes[])
- [ ] **Opportunity** model (from Lead/Customer, type [Sales/Maintenance], items[], status, sales_stage, probability, expected_closing)
- [ ] **Sales Stage** model
- [ ] **Campaign** model
- [ ] Lead → Opportunity conversion
- [ ] Lead/Opportunity list views with pipeline stages
- [ ] **Appointment** scheduling
- [ ] **Contract** management

### 3.2 Quotation

- [ ] **Quotation** model (quotation_to [Lead/Customer], party, items[], taxes[], valid_till, payment_terms, terms, total, grand_total)
- [ ] **Quotation Item** child (item, qty, rate, amount, discount, warehouse, delivery_date)
- [ ] Quotation form with item table + tax calculation (uses Taxes & Totals engine)
- [ ] Quotation print format (PDF)
- [ ] Quotation → Sales Order conversion
- [ ] Quotation expiry tracking
- [ ] **Lost Quotation** reason tracking

### 3.3 Sales Order

- [ ] **Sales Order** model (customer, items[], taxes[], delivery_date, payment_terms, status [Draft/To Deliver and Bill/To Bill/To Deliver/Completed/Cancelled])
- [ ] **Sales Order Item** child (item, qty, rate, amount, delivered_qty, billed_qty, warehouse, delivery_date)
- [ ] Sales Order form with:
  - Customer selection → auto-fetch default address, taxes, price list
  - Item table with real-time pricing from Price List
  - Tax calculation
  - Payment schedule
- [ ] Submit/Cancel workflow
- [ ] Sales Order → Delivery Note conversion
- [ ] Sales Order → Sales Invoice conversion
- [ ] Sales Order → Material Request (for items not in stock)
- [ ] Delivery schedule tracking
- [ ] **Blanket Order** support (framework agreements)

### 3.4 Delivery Note

- [ ] **Delivery Note** model (customer, items[], posting_date, status [Draft/To Bill/Completed/Cancelled])
- [ ] **Delivery Note Item** child (item, qty, rate, warehouse, serial_no, batch_no, against_sales_order)
- [ ] Delivery Note from Sales Order (auto-populate items)
- [ ] Stock deduction on submit (Stock Ledger Entry creation)
- [ ] Delivery Note → Sales Invoice link
- [ ] **Packing Slip** support
- [ ] **Pick List** (warehouse pick instructions)
- [ ] **Delivery Trip** (route planning with stops)
- [ ] **Installation Note** (for items requiring installation)

### 3.5 Sales Invoice

- [ ] **Sales Invoice** model (customer, items[], taxes[], posting_date, due_date, payment_terms, outstanding_amount, paid_amount, status [Draft/Unpaid/Paid/Overdue/Cancelled])
- [ ] **Sales Invoice Item** child (item, qty, rate, amount, warehouse, serial_no, batch_no, income_account, cost_center, against_sales_order, against_delivery_note)
- [ ] **Sales Invoice Payment** child (mode_of_payment, amount, account) — for POS
- [ ] Sales Invoice form:
  - From Sales Order / Delivery Note (auto-populate)
  - Or standalone
  - Tax calculation
  - Payment terms with due date calculation
  - Multi-currency support
- [ ] GL posting on submit:
  - Debit: Customer (Accounts Receivable)
  - Credit: Income Account
  - Credit: Tax Liability Account
  - Optional: Stock deduction (if "Update Stock" is checked)
- [ ] Sales Invoice print format (PDF) with company logo, terms, tax breakdown
- [ ] Credit Note (return invoice) with stock return handling
- [ ] **Deferred Revenue** posting (recognize revenue over time)
- [ ] **Invoice Discounting** (factoring)
- [ ] Recurring Sales Invoice (from Subscription)

### 3.6 Sales Team & Commission

- [ ] **Sales Team** child table (sales_person, contribution %, incentives)
- [ ] Commission calculation based on sales
- [ ] **Sales Partner** commission tracking

### 3.7 Selling Reports

- [ ] Sales Register (list of all sales invoices)
- [ ] Sales Analytics (trends by item/customer/territory/sales person)
- [ ] Sales Order Analysis (pending, completed, cancelled)
- [ ] Gross Profit report
- [ ] Customer Ledger Summary
- [ ] Accounts Receivable (ageing analysis — current, 30, 60, 90, 120+ days)
- [ ] Accounts Receivable Summary
- [ ] Sales Funnel visualization
- [ ] Delivered Items to be Billed
- [ ] Quotation Trends
- [ ] Territory Wise Sales
- [ ] Sales Person Wise Transaction Summary
- [ ] Customer Acquisition and Loyalty

### 3.8 Pricing Rules & Discounts

- [ ] **Pricing Rule** engine (auto-apply discounts based on customer/item/qty/amount/date)
- [ ] **Promotional Scheme** (buy X get Y)
- [ ] **Coupon Code** support
- [ ] Margin calculation (on buying rate or valuation rate)

### Deliverables

- Complete CRM: Lead → Opportunity → Quotation pipeline
- Full Sales Order lifecycle with delivery tracking
- Delivery Note with stock deduction
- Sales Invoice with GL posting, credit notes
- Accounts Receivable ageing
- All selling reports
- Pricing rules and discount engine

---

## Phase 4: Buying Cycle (Week 15-18)

> **Goal**: Implement the complete purchasing workflow from request to payment.

### 4.1 Purchase Request & Sourcing

- [ ] **Material Request** model (purpose [Purchase/Material Transfer/Material Issue/Manufacturing/Customer Provided], items[], status)
- [ ] **Request for Quotation (RFQ)** model (suppliers[], items[])
- [ ] **Supplier Quotation** model (supplier, items[], taxes[])
- [ ] Supplier Quotation comparison tool
- [ ] Material Request → RFQ → Supplier Quotation → Purchase Order flow

### 4.2 Purchase Order

- [ ] **Purchase Order** model (supplier, items[], taxes[], schedule_date, payment_terms, status)
- [ ] **Purchase Order Item** child (item, qty, rate, received_qty, billed_qty, warehouse, schedule_date)
- [ ] Purchase Order form with:
  - Supplier selection → auto-fetch defaults
  - Item table with supplier pricing
  - Tax calculation (Purchase Taxes)
  - Payment schedule
- [ ] PO from Material Request / Supplier Quotation
- [ ] PO → Purchase Receipt conversion
- [ ] PO → Purchase Invoice conversion

### 4.3 Purchase Receipt

- [ ] **Purchase Receipt** model (supplier, items[], posting_date, status)
- [ ] **Purchase Receipt Item** child (item, qty, rate, warehouse, serial_no, batch_no, rejected_qty, rejected_warehouse)
- [ ] Stock addition on submit (Stock Ledger Entry)
- [ ] Quality Inspection integration
- [ ] **Landed Cost Voucher** (add freight, customs, etc. to item cost)
- [ ] Purchase Receipt → Purchase Invoice link

### 4.4 Purchase Invoice

- [ ] **Purchase Invoice** model (supplier, items[], taxes[], posting_date, due_date, outstanding_amount, status)
- [ ] **Purchase Invoice Item** child (item, qty, rate, expense_account, cost_center, against_purchase_order, against_purchase_receipt)
- [ ] GL posting on submit:
  - Debit: Expense / Stock Account
  - Credit: Supplier (Accounts Payable)
  - Credit/Debit: Tax accounts
- [ ] Debit Note (purchase return)
- [ ] **Deferred Expense** posting
- [ ] Purchase Invoice without Purchase Order (service purchases)

### 4.5 Supplier Management

- [ ] **Supplier Scorecard** (rating suppliers based on quality, delivery, pricing)
- [ ] Supplier-wise item pricing history

### 4.6 Buying Reports

- [ ] Purchase Register
- [ ] Purchase Analytics
- [ ] Purchase Order Analysis
- [ ] Accounts Payable (ageing analysis)
- [ ] Accounts Payable Summary
- [ ] Supplier Ledger Summary
- [ ] Procurement Tracker
- [ ] Requested Items to Order and Receive
- [ ] Items to be Billed (received but not invoiced)
- [ ] Received Items to be Billed

### Deliverables

- Material Request → RFQ → Supplier Quotation → Purchase Order flow
- Purchase Receipt with stock addition
- Purchase Invoice with GL posting, debit notes
- Accounts Payable ageing
- Landed Cost allocation
- All buying reports

---

## Phase 5: Inventory / Stock Management (Week 19-23)

> **Goal**: Full inventory management with valuation, serial/batch tracking, and stock analytics.

### 5.1 Stock Ledger Engine

- [ ] **Stock Ledger Entry** model (item, warehouse, posting_date, actual_qty, valuation_rate, stock_value, voucher_type, voucher_no, incoming_rate, outgoing_rate, qty_after_transaction, stock_value_difference)
- [ ] Stock ledger posting service (create SLE on every stock movement)
- [ ] **Bin** model (item + warehouse = current qty, valuation_rate, stock_value, reserved_qty, ordered_qty, projected_qty)
- [ ] Bin update on every SLE

### 5.2 Inventory Valuation

- [ ] **FIFO** (First In, First Out) valuation with FIFO queue tracking
- [ ] **Moving Average** valuation
- [ ] **LIFO** (Last In, First Out) valuation
- [ ] Valuation rate recalculation on backdated entries
- [ ] Stock Value = Qty × Valuation Rate per warehouse
- [ ] **Perpetual Inventory**: Auto GL entries on stock movements (Stock In Hand ↔ COGS/Expense)

### 5.3 Stock Entry (Material Movement)

- [ ] **Stock Entry** model (purpose [Material Receipt/Material Issue/Material Transfer/Manufacture/Repack/Send to Subcontractor], items[], posting_date)
- [ ] **Stock Entry Type** model (configurable purposes)
- [ ] Stock Entry form with source/target warehouse per item
- [ ] Submit → Stock Ledger Entries + GL Entries
- [ ] Material Transfer between warehouses
- [ ] Material Issue (consume from warehouse)
- [ ] Material Receipt (add to warehouse)

### 5.4 Stock Reconciliation

- [ ] **Stock Reconciliation** model (items with current_qty, new_qty, valuation_rate)
- [ ] Reconciliation creates adjustment SLEs to match physical count
- [ ] Opening stock entry support
- [ ] Bulk reconciliation from Excel import

### 5.5 Serial Number & Batch Tracking

- [ ] **Serial No** model (item, warehouse, status, purchase_document, delivery_document, warranty_expiry)
- [ ] **Batch** model (item, batch_id, expiry_date, manufacturing_date, qty)
- [ ] **Serial and Batch Bundle** model (group serial/batch selections)
- [ ] Auto-create serial numbers on purchase receipt
- [ ] Track serial number throughout lifecycle
- [ ] Batch-wise FIFO for perishable goods
- [ ] Batch expiry tracking and alerts

### 5.6 Item Variants

- [ ] **Item Variant** generation from template items
- [ ] **Item Attribute** model (size, color, material, etc.)
- [ ] Variant creation based on attribute combinations
- [ ] Variant-specific pricing and stock tracking

### 5.7 Reorder & Demand Planning

- [ ] **Item Reorder** rules (reorder level, reorder qty, warehouse, material_request_type)
- [ ] Auto-create Material Requests when stock falls below reorder level (scheduled job)
- [ ] **Putaway Rule** (auto-assign warehouse for incoming stock)

### 5.8 Quality Inspection

- [ ] **Quality Inspection** model (item, inspection_type [Incoming/Outgoing/In Process], readings[])
- [ ] **Quality Inspection Template** (standard parameters per item)
- [ ] Mandatory inspection before acceptance (configurable per item)
- [ ] Pass/Fail with acceptance criteria

### 5.9 Stock Reports

- [ ] Stock Balance (current qty + value per item per warehouse)
- [ ] Stock Ledger (all stock movements)
- [ ] Stock Projected Qty (available + ordered − reserved)
- [ ] Stock Analytics (trends over time)
- [ ] Stock Ageing (how long items have been in stock)
- [ ] Warehouse Wise Stock Balance
- [ ] Item Price report
- [ ] Batch Wise Balance History
- [ ] Serial No Ledger / Status
- [ ] Stock and Account Value Comparison (reconcile stock value with GL)
- [ ] COGS by Item Group
- [ ] Negative Stock report
- [ ] Slow Moving / Dead Stock report

### 5.10 Stock Pages

- [ ] Stock Balance dashboard page (with filters)
- [ ] Warehouse Capacity Summary page

### Deliverables

- Real-time stock tracking with valuation (FIFO/Moving Average)
- Serial number and batch tracking
- Stock Entry for all material movements
- Stock reconciliation (physical vs system)
- Perpetual inventory with auto GL posting
- Item variants
- Reorder automation
- Quality inspection
- All stock reports

---

## Phase 6: Manufacturing (Week 24-28)

> **Goal**: Full manufacturing module — BOM, work orders, production planning, job cards.

### 6.1 Bill of Materials (BOM)

- [ ] **BOM** model (item, quantity, items[] [raw materials with qty, rate], operations[], scrap_items[], is_active, is_default)
- [ ] **BOM Item** child (item, qty, rate, amount, source_warehouse)
- [ ] **BOM Operation** child (operation, workstation, time_in_mins, operating_cost)
- [ ] **BOM Scrap Item** child (item, qty, rate)
- [ ] Multi-level BOM (BOM within BOM)
- [ ] BOM cost calculation (raw materials + operations)
- [ ] BOM comparison tool
- [ ] BOM Explorer (tree view of multi-level BOM)
- [ ] **BOM Creator** (visual BOM creation tool)

### 6.2 Work Order

- [ ] **Work Order** model (item, bom, qty, status [Draft/Not Started/In Progress/Completed/Stopped/Cancelled], required_items[], operations[])
- [ ] Work Order from Sales Order / Material Request / Production Plan
- [ ] Material transfer for manufacture (Stock Entry with purpose "Material Transfer for Manufacture")
- [ ] Material consumption tracking
- [ ] Finished goods receipt (Stock Entry with purpose "Manufacture")
- [ ] Work Order completion with actual vs planned tracking
- [ ] Scrap/wastage recording
- [ ] **Process Loss** tracking

### 6.3 Job Card

- [ ] **Job Card** model (work_order, operation, workstation, time_logs[], items[], status)
- [ ] Job Card per operation per work order
- [ ] Time tracking (start/pause/resume/complete)
- [ ] Workstation scheduling
- [ ] Job Card completion triggers next operation

### 6.4 Production Planning

- [ ] **Production Plan** model (from Sales Orders / Material Requests / Forecast)
- [ ] Generate Work Orders from Production Plan
- [ ] Generate Material Requests for raw materials
- [ ] Sub-assembly planning (multi-level)
- [ ] **Master Production Schedule** (future production planning)
- [ ] **Sales Forecast** for demand forecasting

### 6.5 Workstation & Routing

- [ ] **Workstation** model (name, production_capacity, operating_costs, working_hours)
- [ ] **Workstation Type** model
- [ ] **Operation** model
- [ ] **Routing** model (sequence of operations)
- [ ] Workstation capacity planning

### 6.6 Manufacturing Reports

- [ ] BOM Stock Report (material availability for BOMs)
- [ ] Production Analytics (output over time)
- [ ] Work Order Summary
- [ ] Open / Completed / In Progress Work Orders
- [ ] Job Card Summary
- [ ] Work Order Consumed Materials
- [ ] Downtime Analysis
- [ ] Cost of Poor Quality
- [ ] Material Requirements Planning (MRP) report

### 6.7 Plant Floor

- [ ] Visual Plant Floor page (real-time production status)
- [ ] Downtime Entry tracking

### Deliverables

- Multi-level BOM with cost calculation
- Work Order lifecycle with material tracking
- Job Card-level operation tracking with time logs
- Production Planning from sales orders and forecasts
- Workstation and routing management
- All manufacturing reports

---

## Phase 7: Financial Reports & Dashboards (Week 29-32)

> **Goal**: Implement all core financial reports and interactive dashboards.

### 7.1 Core Financial Statements

- [ ] **Profit and Loss Statement** (Income − Expense for a period)
  - Filters: company, fiscal_year, period, cost_center, project, finance_book
  - Monthly/quarterly/yearly columns
  - Previous period comparison
- [ ] **Balance Sheet** (Assets = Liabilities + Equity at a point in time)
  - Same filters as P&L
  - Previous period comparison
- [ ] **Cash Flow Statement** (Operating/Investing/Financing activities)
  - Indirect method (from P&L + Balance Sheet changes)
- [ ] **Trial Balance** (all accounts with debit/credit/closing balances)
  - Filters: company, fiscal year, cost center, project
  - Opening + Debit + Credit + Closing columns
- [ ] **Consolidated Financial Statement** (multi-company consolidation)
- [ ] **Financial Ratios** (current ratio, quick ratio, debt-equity, ROE, etc.)

### 7.2 Ledger Reports

- [ ] **General Ledger** (all GL entries with filters — account, party, date range, voucher type)
- [ ] **Payment Ledger** (all payment ledger entries)
- [ ] **Trial Balance for Party** (customer/supplier wise)
- [ ] **Voucher Wise Balance** (balance per voucher — check for unbalanced entries)

### 7.3 Receivable & Payable Reports

- [ ] **Accounts Receivable** with ageing (current, 0-30, 31-60, 61-90, 90+ days)
- [ ] **Accounts Receivable Summary** (party-wise totals)
- [ ] **Accounts Payable** with ageing
- [ ] **Accounts Payable Summary**
- [ ] Ageing visualization (bar charts)

### 7.4 Tax Reports

- [ ] **Tax Withholding Details** (TDS/TCS reports)
- [ ] **Sales Register** (tax-wise sales summary)
- [ ] **Purchase Register** (tax-wise purchase summary)
- [ ] **Item Wise Sales/Purchase Register**

### 7.5 Budget Reports

- [ ] **Budget Variance Report** (budget vs actual per account/cost center)
- [ ] Monthly/quarterly breakdown

### 7.6 Analytics Dashboards

- [ ] **Executive Dashboard** (summary KPIs — revenue, expenses, profit, cash balance, receivables, payables)
- [ ] **Accounts Dashboard** (incoming/outgoing bills, bank balance, P&L chart)
  - Revenue trend chart
  - Expense breakdown pie chart
  - Cash flow trend
  - Receivable/Payable ageing bars
  - Bank balance timeline
  - Top customers bar chart
  - Top items bar chart
- [ ] **Selling Dashboard** (sales funnel, quotation → order conversion, top customers)
- [ ] **Buying Dashboard** (purchase trends, top suppliers, pending orders)
- [ ] **Stock Dashboard** (stock value, warehouse utilization, low stock alerts)
- [ ] **Manufacturing Dashboard** (production output, downtime, WIP)

### 7.7 Profitability Reports

- [ ] **Gross Profit** (per invoice / per item)
- [ ] **Profitability Analysis** (by cost center / project / territory)
- [ ] **Gross and Net Profit Report**

### 7.8 Other Reports

- [ ] **Customer Ledger Summary**
- [ ] **Supplier Ledger Summary**
- [ ] **Payment Period Based on Invoice Date**
- [ ] **Inactive Sales Items**
- [ ] **Delivered Items to be Billed / Received Items to be Billed**

### 7.9 Report Infrastructure

- [ ] Generic report builder (configurable columns, filters, grouping)
- [ ] Report export: PDF, Excel, CSV
- [ ] Report caching (Redis) for heavy reports
- [ ] Report scheduling (email periodic reports)
- [ ] Report save/share (custom report configurations)
- [ ] Drill-down: click a number → see underlying transactions

### Deliverables

- All core financial statements (P&L, Balance Sheet, Cash Flow, Trial Balance)
- General Ledger with full filtering
- AR/AP ageing reports
- Interactive dashboards with real-time data
- Report export (PDF, Excel, CSV)
- Report caching and scheduling

---

## Phase 8: Assets Module (Week 33-35)

> **Goal**: Fixed asset lifecycle management — purchase, depreciation, maintenance, disposal.

### 8.1 Asset Master

- [ ] **Asset** model (name, item, company, location, purchase_date, gross_purchase_amount, available_for_use_date, status [Draft/Submitted/Partially Depreciated/Fully Depreciated/Sold/Scrapped])
- [ ] **Asset Category** model + **Asset Category Account** (depreciation method, useful life, accounts per company)
- [ ] Asset creation from Purchase Receipt / Purchase Invoice
- [ ] **Location** model (hierarchical asset locations)

### 8.2 Depreciation

- [ ] **Asset Depreciation Schedule** model (auto-generated schedule entries)
- [ ] Depreciation methods: Straight Line, Diminishing Balance, Written Down Value, Double Declining
- [ ] **Asset Finance Book** (parallel depreciation for tax/GAAP)
- [ ] Auto-create Journal Entries for depreciation (scheduled job — monthly/yearly)
- [ ] **Asset Shift Factor** / **Asset Shift Allocation** (multi-shift depreciation)

### 8.3 Asset Transactions

- [ ] **Asset Movement** (transfer between locations/custodians)
- [ ] **Asset Value Adjustment** (impairment / revaluation)
- [ ] **Asset Repair** (cost tracking, GL posting)
- [ ] Asset disposal (sale/scrap) with GL entries (gain/loss on disposal)
- [ ] **Asset Capitalization** (capitalize expense or stock items into assets)

### 8.4 Asset Maintenance

- [ ] **Asset Maintenance** model (maintenance schedule per asset)
- [ ] **Asset Maintenance Log** (completed maintenance records)
- [ ] Maintenance alerts and reminders

### 8.5 Asset Reports

- [ ] Fixed Asset Register
- [ ] Asset Depreciation Ledger
- [ ] Asset Activity log

### Deliverables

- Full asset lifecycle (purchase → depreciation → disposal)
- Multiple depreciation methods
- Asset maintenance tracking
- All asset reports

---

## Phase 9: Projects & Timesheets (Week 36-37)

> **Goal**: Project management, task tracking, timesheet billing.

### 9.1 Projects

- [ ] **Project** model (name, company, status, start_date, end_date, estimated_cost, actual_cost, progress, customer, sales_order)
- [ ] **Project Template** (reusable project structures with tasks)
- [ ] **Project Type** model
- [ ] Project Gantt chart view
- [ ] Project Kanban view
- [ ] Project cost tracking (from timesheets, purchase invoices, expenses)

### 9.2 Tasks

- [ ] **Task** model (subject, project, status, priority, start_date, end_date, assigned_to, depends_on[], progress)
- [ ] **Task Type** model
- [ ] Task dependencies (Gantt)
- [ ] Task list, board (Kanban), and calendar views

### 9.3 Timesheets

- [ ] **Timesheet** model (employee, time_logs[])
- [ ] **Timesheet Detail** (activity_type, from_time, to_time, hours, project, task, billing_rate, billing_amount, costing_rate, costing_amount)
- [ ] **Activity Type** + **Activity Cost** (rate per activity per employee)
- [ ] Timesheet → Sales Invoice (bill time to customer)
- [ ] Timer widget (start/stop time tracking)

### 9.4 Project Reports

- [ ] Project Summary
- [ ] Daily Timesheet Summary
- [ ] Delayed Tasks Summary
- [ ] Timesheet Billing Summary
- [ ] Project Wise Stock Tracking

### Deliverables

- Project management with Gantt and Kanban views
- Task dependencies and tracking
- Timesheet-based billing
- Project profitability analysis

---

## Phase 10: Subcontracting (Week 38-39)

> **Goal**: Manage outsourced manufacturing operations.

### 10.1 Subcontracting

- [ ] **Subcontracting BOM** (BOM for subcontracted items)
- [ ] **Subcontracting Order** (send to subcontractor with supplied items)
- [ ] **Subcontracting Receipt** (receive finished goods, deduct supplied materials)
- [ ] Stock transfer to subcontractor warehouse
- [ ] Back-to-back stock tracking (raw materials sent vs finished goods received)
- [ ] **Subcontracting Inward Order** and related items

### Deliverables

- Complete subcontracting workflow
- Material tracking with subcontractor

---

## Phase 11: POS (Point of Sale) (Week 40-41)

> **Goal**: Retail-ready Point of Sale with offline capability.

### 11.1 POS System

- [ ] **POS Profile** (default warehouse, price list, customer, write-off account, payment methods)
- [ ] **POS Settings** (global POS configuration)
- [ ] POS page — full-screen retail interface:
  - Item grid with search, barcode scanning
  - Cart with quantity adjustment
  - Customer selection / walk-in
  - Multiple payment methods (cash, card, UPI, etc.)
  - Discount application
  - Print receipt (thermal printer format)
- [ ] **POS Invoice** (immediate sales invoice with payment)
- [ ] **POS Opening Entry** (register opening with cash float)
- [ ] **POS Closing Entry** (end-of-day reconciliation)
- [ ] **POS Invoice Merge Log** (consolidate POS invoices into summary invoices)

### 11.2 Offline POS

- [ ] Service Worker for offline operation
- [ ] IndexedDB for offline invoice storage
- [ ] Sync when back online

### Deliverables

- Full POS interface for retail
- Cash register management (opening/closing)
- Offline support with sync

---

## Phase 12: Support & Maintenance (Week 42-43)

> **Goal**: Customer support ticketing and maintenance scheduling.

### 12.1 Support

- [ ] **Issue** model (subject, customer, status, priority, issue_type, sla)
- [ ] **Issue Type** + **Issue Priority**
- [ ] **Service Level Agreement** model (response time, resolution time per priority)
- [ ] SLA tracking (time to first response, resolution time, pause on certain statuses)
- [ ] **Warranty Claim** model
- [ ] Issue list with SLA indicators

### 12.2 Maintenance

- [ ] **Maintenance Schedule** (recurring maintenance for serial no items)
- [ ] **Maintenance Visit** (record of completed maintenance)
- [ ] Auto-schedule based on frequency

### 12.3 Support Reports

- [ ] Issue Analytics
- [ ] Issue Summary
- [ ] First Response Time for Issues
- [ ] Support Hour Distribution

### Deliverables

- Support ticket system with SLA
- Maintenance scheduling
- Warranty tracking

---

## Phase 13: Subscriptions & Recurring (Week 44-45)

> **Goal**: Subscription billing and recurring document generation.

### 13.1 Subscriptions

- [ ] **Subscription** model (party, plans[], status [Active/Past Due/Cancelled/Unpaid], start_date, current_invoice_start, current_invoice_end)
- [ ] **Subscription Plan** (item, billing_interval [Day/Week/Month/Year], billing_interval_count, cost)
- [ ] **Process Subscription** scheduled job (auto-generate invoices)
- [ ] Trial period support
- [ ] Proration on plan changes
- [ ] Cancellation with pro-rated final invoice

### 13.2 Recurring Documents

- [ ] Auto-repeat framework (any document can be set to auto-create periodically)
- [ ] Email notification on auto-creation

### Deliverables

- Subscription management with auto-invoicing
- Recurring document creation

---

## Phase 14: Advanced Features (Week 46-50)

> **Goal**: Polish, advanced features, integrations.

### 14.1 Payment Reconciliation

- [ ] **Payment Reconciliation** tool (match unallocated payments against invoices)
- [ ] Auto-match suggestions based on amount/party
- [ ] Bulk reconciliation

### 14.2 Exchange Rate Revaluation

- [ ] **Exchange Rate Revaluation** (revalue foreign currency balances at period end)
- [ ] Auto-create Journal Entries for unrealized gain/loss

### 14.3 Share Management

- [ ] **Shareholder** + **Share Transfer** + **Share Type** + **Share Balance**

### 14.4 Loyalty Program

- [ ] **Loyalty Program** with point accumulation and redemption
- [ ] Points → invoice discount conversion

### 14.5 Dunning

- [ ] **Dunning** letters for overdue invoices
- [ ] **Dunning Type** (escalation levels)
- [ ] Auto-generate dunning letters based on overdue days

### 14.6 Shipping Rules

- [ ] **Shipping Rule** (auto-calculate shipping charges based on amount/weight/country)

### 14.7 Quality Management

- [ ] **Quality Goal** / **Quality Action** / **Quality Review** / **Quality Meeting** / **Quality Procedure**
- [ ] **Non Conformance** tracking

### 14.8 Statement of Accounts

- [ ] **Process Statement of Accounts** (generate and email customer/supplier statements)

### 14.9 Ledger Merge

- [ ] **Ledger Merge** tool (merge duplicate accounts/parties)

### 14.10 Repost Accounting Ledger

- [ ] **Repost Accounting Ledger** (fix GL entries for past transactions)

### Deliverables

- Payment reconciliation
- Foreign currency revaluation
- Loyalty programs
- Dunning
- Quality management
- All remaining advanced features

---

## Phase 15: Notifications, Scheduling & Background Jobs (Week 51-52)

> **Goal**: Automate routine tasks, send alerts, schedule jobs.

### 15.1 Background Job System

- [ ] Set up **BullMQ** with Redis for job queues
- [ ] Job types: immediate, scheduled (cron), delayed
- [ ] Job monitoring dashboard

### 15.2 Scheduled Jobs (from ERPNext hooks.py)

- [ ] **Hourly**: Send daily work summary, sync exchange rates
- [ ] **Daily**: Process auto-repeat, check reorder level, update outstanding amounts, flag overdue invoices, auto-close SLA, update FIFO queue
- [ ] **Weekly**: Process deferred accounting
- [ ] **Monthly**: Auto-depreciation entries, subscription processing
- [ ] **Cron-specific**: Account closing balance generation, bank reconciliation reminders

### 15.3 Notification System

- [ ] In-app notifications (real-time via Socket.io)
- [ ] Email notifications (overdue invoices, low stock, SLA breach, etc.)
- [ ] **Email Digest** (daily/weekly summary email)
- [ ] Notification preferences per user

### 15.4 Audit Log

- [ ] Track all document changes (who, when, what changed)
- [ ] Version history for critical documents

### Deliverables

- Background job system with monitoring
- All scheduled tasks from ERPNext
- Real-time and email notifications
- Complete audit logging

---

## Phase 16: Printing, PDF & Email (Week 53-54)

> **Goal**: Professional document output.

### 16.1 Print Formats

- [ ] Invoice print (Sales Invoice, Purchase Invoice)
- [ ] Quotation print
- [ ] Sales/Purchase Order print
- [ ] Delivery Note / Purchase Receipt print
- [ ] Journal Entry / Payment Entry print
- [ ] Statement of Account
- [ ] Cheque print template
- [ ] Custom print format builder

### 16.2 PDF Generation

- [ ] Server-side PDF generation (Puppeteer)
- [ ] Template system for print layouts
- [ ] Company letterhead integration

### 16.3 Email

- [ ] Send document via email (invoice to customer, PO to supplier)
- [ ] Email templates per document type
- [ ] Attachment handling (PDF + supporting docs)

### Deliverables

- Professional print formats for all documents
- PDF generation and download
- Email sending with PDF attachments

---

## Phase 17: Import/Export & Data Migration (Week 55-56)

> **Goal**: Data portability and migration tools.

### 17.1 Import

- [ ] Generic CSV/Excel import for all master data (customers, suppliers, items, accounts)
- [ ] Opening balances import (GL, stock)
- [ ] **Chart of Accounts Importer**
- [ ] **Opening Invoice Creation Tool** (bulk create opening invoices)
- [ ] Validation and error reporting during import

### 17.2 Export

- [ ] Export any list view to CSV/Excel
- [ ] Export reports to PDF/Excel
- [ ] Backup/restore functionality

### 17.3 Bank Statement Import

- [ ] CSV bank statement import
- [ ] OFX format support
- [ ] MT940 format support
- [ ] Auto-match imported transactions

### Deliverables

- Bulk data import for all entities
- Opening balance import
- Bank statement import with matching
- Data export capabilities

---

## Phase 18: Regional Compliance (Week 57-58)

> **Goal**: Country-specific tax and compliance features.

### 18.1 India

- [ ] GST compliance (CGST, SGST, IGST)
- [ ] GST tax templates
- [ ] HSN/SAC codes on items
- [ ] E-invoicing (IRN generation)
- [ ] E-way bill
- [ ] TDS (Tax Deducted at Source) / TCS
- [ ] GSTR-1 / GSTR-3B reports

### 18.2 UAE

- [ ] VAT (5%) compliance
- [ ] VAT return (VAT 201)
- [ ] TRN (Tax Registration Number) validation

### 18.3 US

- [ ] Sales tax handling (state-wise)
- [ ] 1099 reporting

### 18.4 General

- [ ] Configurable tax regime per company/country
- [ ] Country-specific default Chart of Accounts
- [ ] Multi-language support (i18n)

### Deliverables

- India GST compliance
- UAE VAT compliance
- US tax basics
- Regional Chart of Accounts templates

---

## Phase 19: Testing & Quality Assurance (Ongoing, dedicated Week 59-61)

> **Goal**: Comprehensive test coverage.

### 19.1 Backend Tests

- [ ] Unit tests for all services (GL engine, tax calculator, valuation, etc.)
- [ ] Integration tests for complete workflows (Quote → Order → Delivery → Invoice → Payment)
- [ ] API endpoint tests for all routes
- [ ] Test fixtures for common scenarios

### 19.2 Frontend Tests

- [ ] Component tests (React Testing Library)
- [ ] Form validation tests
- [ ] Report rendering tests
- [ ] Test utility functions

### 19.3 E2E Tests

- [ ] Playwright tests for critical user flows:
  - Create customer → Quotation → SO → DN → SI → Payment → Reconciliation
  - Create supplier → PO → PR → PI → Payment
  - Stock Entry → Stock Reconciliation
  - BOM → Work Order → Job Card → Finished Goods
  - POS transaction flow

### 19.4 Performance Testing

- [ ] Load test GL posting with 100K+ entries
- [ ] Report generation performance with large datasets
- [ ] Database query optimization
- [ ] Index optimization

### Deliverables

- > 80% backend test coverage
- E2E tests for all critical workflows
- Performance benchmarks

---

## Phase 20: Deployment, Scaling & DevOps (Week 62-64)

> **Goal**: Production-ready deployment.

### 20.1 Infrastructure

- [ ] Docker containerization (frontend + backend + Redis)
- [ ] Docker Compose for local development
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environment management (dev, staging, production)

### 20.2 Database

- [ ] MongoDB Atlas production cluster setup
- [ ] Database migration system (versioned schema changes)
- [ ] Backup strategy (automated daily backups)
- [ ] Read replicas for reports (optional)

### 20.3 Monitoring

- [ ] Application monitoring (error tracking — Sentry)
- [ ] Performance monitoring (APM)
- [ ] Database query monitoring
- [ ] Uptime monitoring
- [ ] Log aggregation

### 20.4 Security

- [ ] Input sanitization on all endpoints
- [ ] Rate limiting per user/IP
- [ ] CORS configuration
- [ ] Helmet.js security headers
- [ ] Dependency vulnerability scanning
- [ ] Data encryption at rest (MongoDB Atlas)
- [ ] API key management for integrations

### 20.5 Scaling

- [ ] Horizontal scaling (multiple backend instances behind load balancer)
- [ ] Redis for session/cache clustering
- [ ] MongoDB Atlas auto-scaling
- [ ] CDN for frontend static assets

### Deliverables

- Docker-based deployment
- CI/CD pipeline
- Monitoring and alerting
- Production security hardening
- Scaling strategy

---

## Summary Timeline

| Phase  | Name                           | Duration   | Key Output                                                  |
| ------ | ------------------------------ | ---------- | ----------------------------------------------------------- |
| **0**  | Infrastructure & Foundation    | Week 1-2   | TS backend, RBAC, reusable components, state management     |
| **1**  | Setup & Master Data            | Week 3-5   | Company, CoA, Item, Customer, Supplier, Warehouse, Taxes    |
| **2**  | Core Accounting Engine         | Week 6-10  | GL, Journal Entry, Payment Entry, Bank, Tax Engine, Budget  |
| **3**  | Selling Cycle                  | Week 11-14 | CRM, Quotation, SO, DN, Sales Invoice, AR reports           |
| **4**  | Buying Cycle                   | Week 15-18 | MR, RFQ, SQ, PO, PR, Purchase Invoice, AP reports           |
| **5**  | Inventory / Stock              | Week 19-23 | Stock Ledger, Valuation, Serial/Batch, Stock Entry, Reports |
| **6**  | Manufacturing                  | Week 24-28 | BOM, Work Order, Job Card, Production Plan, MRP             |
| **7**  | Financial Reports & Dashboards | Week 29-32 | P&L, BS, CF, Trial Balance, Ageing, Dashboards              |
| **8**  | Assets                         | Week 33-35 | Asset lifecycle, depreciation, maintenance                  |
| **9**  | Projects & Timesheets          | Week 36-37 | Projects, Tasks, Timesheets, billing                        |
| **10** | Subcontracting                 | Week 38-39 | Subcontracting orders and receipts                          |
| **11** | POS                            | Week 40-41 | Point of Sale with offline support                          |
| **12** | Support & Maintenance          | Week 42-43 | Tickets, SLA, warranty, maintenance                         |
| **13** | Subscriptions                  | Week 44-45 | Subscription billing, recurring documents                   |
| **14** | Advanced Features              | Week 46-50 | Reconciliation, dunning, loyalty, quality                   |
| **15** | Notifications & Jobs           | Week 51-52 | Background jobs, scheduled tasks, alerts                    |
| **16** | Printing & Email               | Week 53-54 | PDF, print formats, email sending                           |
| **17** | Import/Export                  | Week 55-56 | Data import, bank statements, backups                       |
| **18** | Regional Compliance            | Week 57-58 | GST, VAT, country-specific features                         |
| **19** | Testing & QA                   | Week 59-61 | Unit, integration, E2E, performance tests                   |
| **20** | Deployment & DevOps            | Week 62-64 | Docker, CI/CD, monitoring, security                         |

**Total estimated duration: ~64 weeks (16 months)**

---

## Important Notes

1. **Authentication stays untouched**: Firebase Auth (email, Google, phone OTP, magic link) + the existing user model remain as-is. All new modules integrate with the existing auth system.

2. **Phases can overlap**: Phases 1-2 are sequential (foundation), but after Phase 2, many phases can run in parallel with different team members.

3. **Testing is continuous**: While Phase 19 is a dedicated QA phase, tests should be written alongside each phase.

4. **Each phase is independently deployable**: The system should be usable after each major phase (especially after Phase 3 — selling — the system can already run a basic business).

5. **MongoDB over SQL**: ERPNext uses MariaDB with Frappe ORM. Our MongoDB approach means document-oriented design — embedded child tables, denormalized references, and careful indexing. Some ERPNext patterns (like linked documents) will need adaptation.

6. **No Frappe dependency**: We are NOT importing any Python/Frappe code. We are using ERPNext as a **specification** and re-implementing in Node.js/TypeScript.

7. **Progressive Enhancement**: Start with core workflows, add advanced features later. A business should be operational after Phase 7 (reports).
