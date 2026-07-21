# UI Section Standard & Agent Execution Protocol

This document defines the UI quality standard for all module sections in the application. When a user mentions a section or references this document, the AI agent must automatically audit that section against these 4 rules and implement any missing requirements.

---

## 📋 The 4 Standard UI Rules

### Rule 1: Zero `#` Tags & Symbols in UI Labels & Headers
- **Form Labels & Inputs**: Replace `#` symbols with proper descriptive words:
  - `Invoice #` $\rightarrow$ `Invoice Number`
  - `Bill #` $\rightarrow$ `Bill Number`
  - `Quote #` $\rightarrow$ `Quote Number`
  - `Reference #` / `Reference#` $\rightarrow$ `Reference Number`
  - `Payment #` / `Payment Voucher #` $\rightarrow$ `Payment Voucher Number`
  - `Order #` $\rightarrow$ `Order Number`
  - `Challan #` $\rightarrow$ `Challan Number`
- **Table Column Headers**: Column headers must use `Invoice Number`, `Bill Number`, `Reference Number`, etc.
- **Placeholders**: Inputs must feature clear placeholders (e.g. `"Select or enter invoice number"`).

### Rule 2: Top Search Bar & Multi-Field Real-Time Filtering
- **Toolbar Search Input**: Every list page must feature a functional top search bar.
- **Real-Time Matching**: Search query must match across:
  - Record Number (Invoice Number, Bill Number, Quote Number, etc.)
  - Contact Name (Customer Name, Vendor Name, Company Name)
  - Reference Number
  - Status (Draft, Open, Paid, Overdue, Void, etc.)
  - Total Amounts
- **Status Filter**: Standard status filter dropdown (`All`, `Draft`, `Open`, `Paid`, `Overdue`, `Void`).

### Rule 3: Interactive Column Header Sorting (Ascending / Descending)
- Every column header in list tables must support interactive click-to-sort toggle:
  - Click 1: Sort Ascending (`↑`)
  - Click 2: Sort Descending (`↓`)
- Visual sort indicators (e.g., Lucide `ArrowUpDown`, `ChevronUp`, or `ChevronDown`) must indicate current sort field and direction.
- Column sort data types:
  - **Date**: Chronological sort (`new Date(a) - new Date(b)`)
  - **Number**: Alphanumeric sort (`a.localeCompare(b, undefined, { numeric: true })`)
  - **Name / Contact**: Case-insensitive alphabetical sort
  - **Amount / Balance**: Numerical sort (`a - b`)

### Rule 4: Agent Audit & Auto-Implementation Workflow
When instructed to process any section (e.g. `@Invoices`, `@Bills`, `@Vendors`, `@Customers`, `@Items`, `@Quotes`, `@PaymentsMade`, `@PaymentsReceived`, `@Expenses`):
1. 🔍 **Audit**: Inspect the section's list page, create page, edit page, and detail views against Rules 1, 2, and 3.
2. 🛠️ **Implement**: Automatically edit the section code to add missing search filters, column header sorting, and `#` tag removals.
3. 🧪 **Verify**: Execute `npx tsc --noEmit` in `client/` to guarantee 0 TypeScript errors.

---

## 🗂️ Module Section Registry & Audit Status

| Section | Route | `#` Tag Cleaned | Header Search | Column Sorting | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Items** | `/items` | ✅ | ✅ | ✅ | Completed |
| **Payments Made** | `/purchases/payments-made` | ✅ | ✅ | 🔲 | Pending Sort |
| **Payments Received** | `/sales/payments-received` | ✅ | ✅ | 🔲 | Pending Sort |
| **Invoices** | `/sales/invoices` | ✅ | ✅ | 🔲 | Pending Sort |
| **Bills** | `/purchases/bills` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Customers** | `/sales/customers` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Vendors** | `/purchases/vendors` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Quotes** | `/sales/quotes` | ✅ | 🔲 | 🔲 | Pending Sort |
| **Expenses** | `/purchases/expenses` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Credit Notes** | `/sales/credit-notes` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Sales Orders** | `/sales/orders` | 🔲 | 🔲 | 🔲 | Pending Audit |
| **Purchase Orders** | `/purchases/orders` | 🔲 | 🔲 | 🔲 | Pending Audit |
