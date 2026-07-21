# UI Section Standard & Agent Execution Protocol

This document defines the UI quality standard for all module sections in the application. When a user mentions a section or references this document, the AI agent must automatically audit that section against these 5 rules and implement any missing requirements across list pages, summary headers, date range filters, creation forms (`/new`), edit forms (`/[id]/edit`), and modal/editor components.

---

## 📋 The 5 Standard UI Rules

### Rule 1: Zero `#` Tags & Symbols in UI Labels, Headers, & Creation/Edit Forms
- **List Page Table Column Headers**: Column headers must use `Invoice Number`, `Bill Number`, `Reference Number`, `Quote Number`, `Order Number`, `Package Number`, `Tracking Number`, `Shipment Order Number`, `Putaway Number`, etc. (No `#` tags).
- **Creation Forms (`/new`) & Edit Forms (`/[id]/edit` & Modals/Editors)**:
  - Audit all `<label>`, `<Input>`, `<Select>`, `<Textarea>`, `<DialogTitle>`, `<CardTitle>`, placeholder strings, tooltips, and helper texts.
  - Replace `#` symbols with proper descriptive words:
    - `Invoice #` / `Invoice#` $\rightarrow$ `Invoice Number`
    - `Bill #` / `Bill#` $\rightarrow$ `Bill Number`
    - `Quote #` / `Quote#` $\rightarrow$ `Quote Number`
    - `Reference #` / `Reference#` $\rightarrow$ `Reference Number`
    - `Payment #` / `Payment Voucher #` $\rightarrow$ `Payment Voucher Number`
    - `Order #` / `Sales Order #` $\rightarrow$ `Order Number` / `Sales Order Number`
    - `Challan #` / `Delivery Challan #` $\rightarrow$ `Delivery Challan Number`
    - `Credit Note #` $\rightarrow$ `Credit Note Number`
    - `Item #` / `SKU #` $\rightarrow$ `Item Number` / `SKU Number`
    - `Package #` / `Package Slip #` $\rightarrow$ `Package Number` / `Package Slip Number`
    - `Shipment Order #` / `Tracking #` $\rightarrow$ `Shipment Order Number` / `Tracking Number`
    - `Putaway #` $\rightarrow$ `Putaway Number`
- **Placeholders**: Inputs must feature clear descriptive placeholders (e.g. `"Enter invoice number"`).

### Rule 2: Top Search Bar & Multi-Field Real-Time Filtering
- **Toolbar Search Input**: Every list page must feature a functional top search bar.
- **Real-Time Matching**: Search query must match across Record Number, Contact Name, Reference Number, Status, and Amounts.
- **Status Filter Dropdown**: Standard status filter dropdown (`All`, `Draft`, `Open`, `Paid`, `Overdue`, `Void`, `Shipped`, `Delivered`).

### Rule 3: Compact Date Range Filter Popover
- **Popover Trigger**: Date filtering must NOT take up large permanent vertical space. Use a compact button trigger `[📅 Date Range]` or `[📅 Select Dates]`.
- **Date Popover**: Clicking the button opens a clean Popover/Dropdown containing From Date, To Date, and Clear button.
- **Active State Indicator**: Highlight the Date Filter button when a date range filter is active.

### Rule 4: Compact KPI Summary Strip (Space-Optimized)
- Sleek, compact metric cards / summary strip at the top of list views that preserve vertical space for the table: Total Count, Total Value, Stock on Hand, Goods, Services, etc.

### Rule 5: Interactive Sorting & Visual Direction Indicators on ALL Column Headers
- **ALL Column Headers Must Be Interactive Triggers**: Every table column header must be a clickable sort trigger button.
- **Visual Sort Indicators (`▲`, `▼`, `↕`)**:
  - Currently sorted column: Display `▲` (ascending) or `▼` (descending) in bold teal/primary color.
  - Other sortable columns: Display a subtle sort indicator (`↕`) on hover.

---

## 🗂️ Module Section Registry & Audit Status

| Section | Route | `#` Cleaned | Search & Status | Compact Date Popover | KPI Summary Strip | All Columns Sortable | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Items** | `/items` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Inventory Adjustments** | `/inventory/adjustments` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Inventory Move Orders** | `/inventory/move-orders` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Inventory Packages** | `/inventory/packages` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Inventory Putaways** | `/inventory/putaways` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Inventory Shipments** | `/inventory/shipments` | ✅ | ✅ | N/A | ✅ | ✅ | Completed |
| **Invoices** | `/sales/invoices` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Customers** | `/sales/customers` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Quotes** | `/sales/quotes` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Payments Received** | `/sales/payments-received` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Credit Notes** | `/sales/credit-notes` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Sales Orders** | `/sales/orders` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Delivery Challans** | `/sales/delivery-challans` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
| **Retainer Invoices** | `/sales/retainer-invoices` | ✅ | ✅ | ✅ | ✅ | ✅ | Completed |
