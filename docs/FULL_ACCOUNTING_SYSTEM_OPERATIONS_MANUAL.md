# HAI Accounting Full Operations Manual

Version: 1.0  
Last Updated: 2026-04-03

## 1) Purpose
This document explains how the accounting system works end-to-end for accountant users, tester users, and live operations teams.

It covers:
- Business definition of each section
- Required setup before use
- Field-level meaning for major forms
- Typical workflow and status movement
- Accounting effect (whether it posts to books)
- Example transactions
- Testing checklist for UAT and production readiness

## 2) Audience
- Accountant users who need process clarity
- UAT testers who validate business correctness
- Operations users who run daily finance tasks
- Product owners who track module completeness

## 3) Core Accounting Design
The system follows an immutable voucher-ledger design for posted accounting events.

- Source documents drive vouchers
- Ledger entries are stored as immutable GL rows
- Reversals create opposite rows instead of editing old rows
- Reports read GL and summarize balances

Current voucher types in use:
- Invoice
- Bill
- Payment Made
- Payment Received
- Journal

## 4) Current Module Readiness (April 2026)

| Module | UI | API | Accounting Posting | Overall |
|---|---|---|---|---|
| Items | Yes | Yes | Indirect (inventory/cogs via invoices/bills) | Ready |
| Sales Customers | Yes | Yes | Indirect | Ready |
| Quotes | Yes | Yes | No direct posting | Ready (operational) |
| Sales Orders | Yes | Yes | No direct posting | Ready (operational) |
| Invoices | Yes | Yes | Yes | Ready |
| Recurring Invoices | Yes | Yes | Yes (through generated invoices) | Ready |
| Delivery Challans | Yes | Yes | No direct posting | Ready (operational) |
| Payments Received | Yes | Yes | Yes | Ready |
| Credit Notes (Sales) | Route only | No full module | No | Partial |
| Purchases Vendors | Yes | Yes | Indirect | Ready |
| Expenses | Yes | Yes | Not yet linked to GL posting | Partial |
| Recurring Expenses | Yes | Yes | Not yet linked to GL posting | Partial |
| Purchase Orders | Yes | Yes | No direct posting | Ready (operational) |
| Bills | Yes | Yes | Yes | Ready |
| Recurring Bills | Yes | Yes | Yes (through generated bills) | Ready |
| Payments Made | Yes | Yes | Yes | Ready |
| Vendor Credits | Yes | Yes | Not yet linked to GL posting | Partial |
| Chart of Accounts | Yes | Yes | Foundation for all posting | Ready |
| Reports | Yes | Yes | GL-based | Ready |

## 5) Required Setup Before Daily Use

### 5.1 Organization and Base Controls
Set once at the start:
- Organization profile
- Fiscal year start month
- Base currency
- Date and number format
- Tax identity and contact details

### 5.2 Chart of Accounts
Must exist before posting transactions.
Minimum recommended accounts:
- Bank
- Cash
- Accounts Receivable
- Accounts Payable
- Sales
- Purchases or Expense accounts
- Inventory Asset
- Cost of Goods Sold
- Customer Advances
- Advances to Suppliers
- Tax payable/receivable accounts

### 5.3 Statutory and Operational Masters
Configure:
- Taxes
- Payment terms
- Payment modes
- Warehouses
- Sales persons
- Expense categories
- Reporting tags
- Price lists

### 5.4 Opening Balances
Before first live posting:
- Enter opening debit/credit by account
- Verify total debit equals total credit
- Confirm opening balance adjustment is zero or controlled

### 5.5 First Setup Example (Do This Before Section 6)
Recommended setup order:
1. Configure settings masters (taxes, payment terms, payment modes, warehouses, expense categories, reporting tags, price lists)
2. Create chart of accounts (including control accounts for receivables and payables)
3. Enter opening balances and supporting schedules
4. Validate Trial Balance totals are equal

Filled setup examples:
- Tax: GST 18% (rate 18, mapped to Tax Payable)
- Payment term: Net 30 (net_days = 30)
- Payment mode: Online Transfer (mapped to Habib Bank Limited)
- Warehouse: Main Warehouse
- Price list: Standard Sales Price 2026

Opening balance worked example:

| Particulars | Debit | Credit |
|---|---:|---:|
| Accounts Receivables | 2,350,000 | 0 |
| Accounts Payables | 0 | 1,550,000 |
| Stock | 15,937,500 | 0 |
| Buildings | 9,000,000 | 0 |
| Acc. Dep of Buildings | 0 | 1,500,000 |
| Vehicle | 6,000,000 | 0 |
| Acc. Dep of Vehicle | 0 | 600,000 |
| Machinery | 750,000 | 0 |
| Acc. Dep of Machinery | 0 | 150,000 |
| Cash in Hand | 850,000 | 0 |
| Habib Bank Limited | 7,000,000 | 0 |
| MCB Bank Limited | 3,500,000 | 0 |
| Accrued expenses | 0 | 53,000 |
| Capital Invested | 0 | 41,534,500 |
| Total | 45,387,500 | 45,387,500 |

Validation checks:
- Debit total equals credit total
- Receivables party breakup total equals Accounts Receivables
- Payables party breakup total equals Accounts Payables
- Stock item breakup total equals Stock opening balance

For complete field-by-field setup entries, use Section 0 in SECTION_WISE_FILLED_EXAMPLES_GUIDE.md.

## 6) Section-by-Section Manual

## 6A) Sales Domain

### A1) Items
Definition:
- Master data for goods/services used in sales and purchase documents.

Important fields:
- Item name
- SKU
- Item type: Goods or Service
- Selling price
- Cost price
- Sales account
- Purchase account
- Tax preference
- Inventory tracked
- Stock on hand
- Reorder point

Workflow:
1. Create item
2. Assign account and tax mapping
3. Use item in quotes/orders/invoices/bills

Accounting effect:
- No direct voucher on item create/edit
- Used by invoice/bill posting logic

Example:
- Item: A4 Copier Paper
- Type: Goods
- Selling price: 320
- Cost price: 250
- Inventory tracked: Yes

### A2) Sales Customers
Definition:
- Customer and contact master used across sales cycle.

Important fields:
- Contact type
- Display name/company name
- GSTIN/PAN
- Currency
- Payment terms
- Billing/shipping address
- Contact persons
- Opening balance

Workflow:
1. Create customer
2. Set payment terms and tax treatment
3. Use customer in quote/order/invoice/payment

Accounting effect:
- No direct voucher on create/update
- Receivable impact happens through invoices/payments

Example:
- Customer: Alpha Stores
- Currency: INR
- Payment terms: Net 30

### A3) Quotes
Definition:
- Non-posting commercial offer document before order/invoice.

Key statuses:
- Draft
- Sent
- Accepted
- Rejected
- Invoiced
- Expired

Important fields:
- Quote number/date/expiry date
- Customer
- Line items with qty/rate/discount/tax
- Subtotal, discount, tax, adjustment, total
- Subject, notes, terms

Workflow:
1. Draft quote
2. Send quote
3. Accept/reject
4. Convert or recreate into sales order/invoice

Accounting effect:
- No direct GL posting

Example:
- Quote total: 25,000
- Status moves Draft -> Sent -> Accepted

### A4) Sales Orders
Definition:
- Commitment document before invoicing and delivery.

Key statuses:
- DRAFT
- APPROVED
- PARTIALLY_INVOICED
- INVOICED
- CLOSED
- OVERDUE

Important fields:
- Sales order number
- Customer
- Order date and expected shipment date
- Line items
- Shipping, adjustment, total
- Delivery method

Workflow:
1. Create order
2. Approve order
3. Deliver/invoice partially or fully

Accounting effect:
- No direct GL posting

Example:
- SO for 100 units; invoice 60 first, then 40

### A5) Invoices
Definition:
- Primary sales posting document for receivable and revenue.

Key statuses:
- Draft
- Sent
- Viewed
- Overdue
- Partially Paid
- Paid
- Void

Important fields:
- Invoice number/date/due date
- Customer
- Line items with amount and tax
- Discount, adjustment, total, balance due
- Payment received flag

Workflow:
1. Create Draft or Sent
2. Send/mark sent
3. Record payment or receive through Payments Received
4. Move to Paid or Void when appropriate

Accounting effect:
- Posts receivable and revenue (plus tax and cogs logic where applicable)
- Void/reversal creates reversing GL effect

Example:
- Invoice total: 10,000
- Entry concept: Dr Accounts Receivable 10,000; Cr Sales 10,000

### A6) Recurring Invoices
Definition:
- Invoice template profile that auto-generates periodic invoices.

Key statuses:
- active
- paused
- stopped
- completed

Important fields:
- Profile name
- Frequency (weekly, every_10_days, every_15_days, monthly)
- Start/end control
- Delivery mode (draft or send)
- Customer and line details

Workflow:
1. Create recurring profile
2. System generates invoices on next run date
3. Generated invoices follow normal invoice lifecycle

Accounting effect:
- Posting occurs when generated invoice is created/posted

Example:
- Monthly rent invoice every 1st day

### A7) Delivery Challans
Definition:
- Dispatch/tracking document for goods movement before invoicing.

Key statuses:
- Draft
- Open
- Delivered
- Returned

Important fields:
- Challan number/date
- Challan type
- Customer
- Item lines
- Invoice status link

Workflow:
1. Create challan
2. Mark delivered
3. Convert/associate with invoice

Accounting effect:
- No direct GL posting in current design

Example:
- Challan for 50 units with invoice status NOT INVOICED

### A8) Payments Received
Definition:
- Receipts from customers against invoices or as advances.

Key statuses:
- DRAFT
- PAID
- VOID

Important fields:
- Payment number/date/mode
- Customer
- Total amount received
- Amount used for invoices
- Amount in excess
- Invoice application lines

Workflow:
1. Create payment (draft or paid)
2. Apply/unapply against invoice
3. Record refund from advance if needed
4. Void when required

Accounting effect:
- Create/apply/unapply/refund post proper payment vouchers
- Void reverses posted payment vouchers

Example:
- Receive 15,000
- Apply 12,000 to invoice
- Keep 3,000 as customer advance

### A9) Credit Notes (Sales)
Definition:
- Intended module for sales return/credit adjustments.

Current state:
- Navigation route exists
- Full API, posting, and lifecycle module pending

Current operating workaround:
- Use manual journals for temporary accounting adjustments until full module is delivered

## 6B) Purchase Domain

### B1) Vendors
Definition:
- Vendor/contact master for purchase processes.

Important fields:
- Vendor name/company
- Tax and address details
- Payment terms
- Accounts payable mapping

Workflow:
1. Create vendor
2. Use in purchase orders, bills, payments, vendor credits

Accounting effect:
- No direct voucher on create/update

Example:
- Vendor: Prime Paper Suppliers

### B2) Expenses
Definition:
- Non-inventory expense capture (regular or mileage).

Key statuses:
- Draft
- Submitted
- Approved
- Rejected
- Reimbursed

Important fields:
- Expense number/date
- Expense type (Regular/Mileage)
- Account mapping
- Amount or itemized lines
- Paid through account
- Vendor/customer (optional)

Workflow:
1. Create expense
2. Submit/approve workflow
3. Track receipts and reimbursement

Accounting effect:
- Current implementation: no direct GL posting yet

Example:
- Fuel expense 4,500 posted as Approved

### B3) Recurring Expenses
Definition:
- Scheduled profile for periodic expense generation.

Key statuses:
- Active
- Stopped
- Expired

Important fields:
- Profile name
- Frequency and repeat interval
- Start/end date
- Amount and account

Workflow:
1. Create recurring profile
2. Generate expense now or by schedule
3. Manage status stop/resume

Accounting effect:
- Current implementation: generated expenses still follow non-GL expense behavior

Example:
- Monthly internet expense profile

### B4) Purchase Orders
Definition:
- Procurement commitment document before bill posting.

Important fields:
- Purchase order number/date
- Vendor
- Delivery details
- Line items, discount, tax, total
- Terms/notes

Workflow:
1. Create PO
2. Approve/send
3. Convert to bill

Accounting effect:
- No direct GL posting

Example:
- PO for office supplies 30,000

### B5) Bills
Definition:
- Primary purchase posting document for payable and expense/inventory value.

Key statuses:
- Draft
- Open
- Overdue
- Partially Paid
- Paid
- Void

Important fields:
- Bill number/date/due date
- Vendor
- Line items with account and amount
- Discount/tax/adjustment/total
- Amount paid and balance due

Workflow:
1. Create bill
2. Open and monitor due
3. Apply payments/vendor credits
4. Void if required under controls

Accounting effect:
- Posts payable and expense or inventory-related movement
- Reverses voucher on void/posting rollback state

Example:
- Bill 20,000: Dr Expense 20,000; Cr Accounts Payable 20,000

### B6) Recurring Bills
Definition:
- Scheduled template for periodic vendor bills.

Key statuses:
- Active
- Stopped
- Expired

Important fields:
- Profile and frequency
- Vendor and line model
- Tax and discount model
- Generated bill list

Workflow:
1. Create recurring bill profile
2. Auto/manual generate bill
3. Generated bill follows normal bill posting lifecycle

Accounting effect:
- Through generated bills only

Example:
- Monthly office rent bill profile

### B7) Payments Made
Definition:
- Outgoing payments to vendors against bills or as advances.

Key statuses:
- DRAFT
- PAID
- VOID

Important fields:
- Payment number/date/mode
- Vendor
- Total amount paid
- Amount used for bills
- Amount in excess
- Bill applications

Workflow:
1. Create payment
2. Apply/unapply to bills
3. Record vendor refund
4. Void if needed

Accounting effect:
- Voucher events for create/apply/unapply/refund
- Void reverses posted payment vouchers

Example:
- Pay 50,000
- Apply 45,000 to bills
- Keep 5,000 as vendor advance

### B8) Vendor Credits
Definition:
- Vendor-issued credit memo to reduce payable.

Key statuses:
- DRAFT
- OPEN
- PARTIALLY_APPLIED
- CLOSED
- VOID

Important fields:
- Vendor credit number/date
- Vendor
- Reference bill
- Line items and totals
- Applied amount and balance amount

Workflow:
1. Create vendor credit
2. Apply/unapply to bills
3. Track open/closed status

Accounting effect:
- Current implementation: application logic exists, direct GL posting integration pending

Example:
- Vendor credit 8,000 applied to an open bill

## 6C) Accountant Domain

### C1) Chart of Accounts
Definition:
- Core accounting structure of assets, liabilities, equity, income, expense.

Important fields:
- Account name/code
- Root type
- Account type
- Opening balance
- Current balance
- Active/system flags

Workflow:
1. Seed template
2. Add required company-specific accounts
3. Configure opening balances
4. Keep control accounts active

Accounting effect:
- All posted vouchers impact account balances

### C2) Manual Journals
Definition:
- Direct accounting entries for adjustments/corrections/reclassifications.

Typical statuses:
- Draft
- Posted
- Voided

Workflow:
1. Draft balanced journal
2. Post journal
3. Void if required with reversal logic

Accounting effect:
- Direct GL posting/reversal

### C3) Other Accountant Tools
- Bulk Update: mass operation support
- Currency Adjustments: multi-currency corrections
- Transaction Locking: period control and governance

## 6D) Reports and Reconciliation

Main reports:
- Trial Balance
- Profit and Loss
- Balance Sheet
- Control Reconciliation

How report numbers are formed:
- Reads GL movement grouped by account
- Uses account metadata to classify into roots/types
- Uses date filter logic for period/as-of views

Common zero-value reasons:
- No GL postings in selected org
- Wrong date range
- Missing chart accounts in org during early setup

## 6E) Settings and Configuration

Settings pages in use:
- General
- Taxes
- Currencies
- Opening Balances
- Reminders
- Customer Portal
- Email/SMTP
- PayU

Additional settings APIs available:
- Taxes
- Payment Terms
- Warehouses
- Sales Persons
- Payment Modes
- Expense Categories
- Reporting Tags
- Price Lists

## 7) End-to-End Example Flows

### Flow 1: Standard Order-to-Cash
1. Create Item and Customer
2. Create Quote and send
3. Create Sales Order after acceptance
4. Create Invoice from order
5. Receive payment in Payments Received
6. Apply amount to invoice
7. Validate reports:
   - Trial Balance updates
   - AR reduces after payment

Sample amounts:
- Invoice total 10,000
- Payment received 10,000
- Final invoice balance due 0

### Flow 2: Customer Advance and Later Application
1. Receive payment 15,000 with no immediate invoice mapping
2. System keeps amount as customer advance
3. Later create invoice 12,000
4. Apply 12,000 from advance
5. Remaining advance 3,000

### Flow 3: Procure-to-Pay
1. Create Vendor
2. Raise Purchase Order
3. Convert to Bill 20,000
4. Create Payment Made 20,000
5. Apply to bill
6. Validate AP is cleared in control reconciliation

### Flow 4: Vendor Advance + Refund
1. Create Payment Made 50,000 against no bill (advance)
2. Apply 30,000 to future bill
3. Record refund 5,000
4. Check advance balance movement

### Flow 5: Recurring Revenue
1. Create recurring invoice profile monthly
2. Generate invoice now
3. Send and collect payment
4. Validate invoice posted and cash/receivable movement

### Flow 6: Recurring Vendor Cost
1. Create recurring bill profile monthly
2. Generate bill
3. Pay through Payments Made
4. Validate bill and payment voucher chain

## 8) UAT Test Checklist by Module

Use this as pass/fail checklist.

Items:
- Create Goods and Service item
- Verify item appears in invoice and bill item pickers

Customers and Vendors:
- Create with tax and address details
- Verify availability in document forms

Quotes and Sales Orders:
- Create, update, and status transitions
- Verify no accidental GL posting

Invoices:
- Create Draft and Sent
- Record payment and verify balance due update
- Void and verify reversal behavior

Payments Received:
- Create PAID with invoice mapping
- Unapply and reapply
- Refund from excess
- Void and verify reversal

Purchase Orders:
- Create and convert to bill

Bills:
- Create, pay partially, pay fully
- Void and validate reversal

Payments Made:
- Create, apply/unapply, refund, void

Recurring Invoices/Bills/Expenses:
- Create profile
- Trigger generate now
- Stop and resume profile

Vendor Credits:
- Create and apply to bill
- Verify bill balance impact

Chart of Accounts:
- Add account
- Configure opening balances
- Confirm balanced opening totals

Reports:
- Trial Balance non-zero after postings
- Profit and Loss for date range with activity
- Balance Sheet equation check
- AR/AP control reconciliation difference close to zero

## 9) Go-Live Readiness Checklist

Before go-live:
- Chart of accounts completed
- Opening balances completed and balanced
- Taxes and payment terms configured
- Test transactions completed for all critical flows
- Reports validated by accountant sign-off

During go-live week:
- Daily trial balance review
- Daily AR/AP reconciliation check
- Exception log for void/refund/reversal events

## 10) Known Gaps and Current Workarounds

Current known functional gaps:
1. Sales Credit Notes full module pending
2. Expense direct GL posting pending
3. Recurring Expense GL integration pending
4. Vendor Credit direct GL posting integration pending

Current controlled workaround:
- Use Manual Journal entries for adjustments where a dedicated module is pending
- Keep approval control for such journal entries

## 11) Tester Notes for Live Organization

For accountant and live tester usage:
- Always test in correct active organization
- Use realistic dates (month start to current date) for report testing
- Validate both document status and accounting impact
- Capture evidence screenshots for each pass/fail step

Recommended evidence per test:
- Form input screenshot
- Saved document screenshot
- Related payment/application screen
- Trial Balance or control reconciliation screenshot

## 12) Document Maintenance Process

Update this manual when:
- New module is released
- Status values or field meanings change
- Accounting logic changes (posting/reversal/control)
- New compliance settings are introduced

Owner recommendation:
- Product accounting owner + lead QA accountant
