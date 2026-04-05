# HAI Accounting UAT Test Cases

Version: 1.0  
Last Updated: 2026-04-03

## 1) UAT Execution Rules
- Run tests in one selected organization only
- Use same test date range across all reports
- Capture evidence for every case: input, saved output, report impact
- Mark each test as PASS or FAIL with notes

## 2) Suggested Master Data for UAT
Use this baseline set:
- Customer: Alpha Stores
- Vendor: Prime Paper Suppliers
- Item (Goods): A4 Copier Paper
- Item (Service): Annual Support
- Bank account: HDFC Current Account
- Revenue account: Sales
- Control accounts: Accounts Receivable, Accounts Payable

## 3) Test Case Matrix

| ID | Module | Scenario | Expected Result |
|---|---|---|---|
| UAT-ITEM-001 | Items | Create Goods item with tax | Item saved and available in invoice/bill forms |
| UAT-ITEM-002 | Items | Create Service item | Item saved and available in invoice lines |
| UAT-CUST-001 | Customers | Create customer with terms and GST data | Customer saved and selectable in sales forms |
| UAT-VEND-001 | Vendors | Create vendor with payment terms | Vendor saved and selectable in purchase forms |
| UAT-QUOTE-001 | Quotes | Create Draft quote and move to Sent | Status transitions correctly, no GL impact |
| UAT-SO-001 | Sales Orders | Create order and move to Approved | Status updated, no GL impact |
| UAT-INV-001 | Invoices | Create invoice (Sent) | Invoice created, receivable/revenue posting visible in reports |
| UAT-INV-002 | Invoices | Record full payment | Invoice status becomes Paid, balance due is zero |
| UAT-INV-003 | Invoices | Void invoice | Reversal behavior reflected, report balances adjust |
| UAT-RINV-001 | Recurring Invoices | Create active recurring profile | Profile saved with next run metadata |
| UAT-RINV-002 | Recurring Invoices | Generate invoice now | New invoice created and follows invoice lifecycle |
| UAT-DC-001 | Delivery Challans | Create challan and mark delivered | Status updated, invoice link remains consistent |
| UAT-PR-001 | Payments Received | Create PAID payment applied to invoice | Invoice due reduces by applied amount |
| UAT-PR-002 | Payments Received | Unapply and reapply amount | Due recalculates correctly |
| UAT-PR-003 | Payments Received | Refund from excess advance | Refund event recorded and balances adjust |
| UAT-PR-004 | Payments Received | Void payment | Payment voucher chain reversed |
| UAT-PO-001 | Purchase Orders | Create PO and verify totals | PO saved and ready for bill conversion |
| UAT-BILL-001 | Bills | Create bill and keep Open | AP impact visible and status Open |
| UAT-BILL-002 | Bills | Partial payment | Bill status Partially Paid with correct balance due |
| UAT-BILL-003 | Bills | Full payment | Bill status Paid and due zero |
| UAT-BILL-004 | Bills | Void bill | Reversal behavior reflected in reports |
| UAT-RBILL-001 | Recurring Bills | Create recurring profile | Profile saved with schedule |
| UAT-RBILL-002 | Recurring Bills | Generate bill now | New bill created and usable in payments |
| UAT-PM-001 | Payments Made | Create payment and apply to bill | Bill due reduces, paid amount updates |
| UAT-PM-002 | Payments Made | Unapply amount | Bill due increases accordingly |
| UAT-PM-003 | Payments Made | Refund from vendor advance | Refund recorded and advance adjusted |
| UAT-PM-004 | Payments Made | Void payment | Reversal behavior reflected |
| UAT-VC-001 | Vendor Credits | Create vendor credit | Credit saved and shown as available |
| UAT-VC-002 | Vendor Credits | Apply vendor credit to bill | Bill due reduces and credit balance updates |
| UAT-EXP-001 | Expenses | Create expense and approve | Expense workflow status updates correctly |
| UAT-REXP-001 | Recurring Expenses | Create recurring expense profile | Profile saved and schedulable |
| UAT-REXP-002 | Recurring Expenses | Generate expense now | Expense generated from profile |
| UAT-COA-001 | Chart of Accounts | Add custom account | Account appears in chart and is selectable |
| UAT-OB-001 | Opening Balances | Enter opening balances | Debits and credits balanced |
| UAT-RPT-001 | Reports | Trial Balance after postings | Non-zero balances reflect posted activity |
| UAT-RPT-002 | Reports | Profit and Loss for active period | Income and expense totals shown |
| UAT-RPT-003 | Reports | Balance Sheet for active period | Assets = Liabilities + Equity |
| UAT-RPT-004 | Reports | AR/AP control reconciliation | Differences remain controlled/traceable |

## 4) High Priority Regression Cases
Run these on every release:
- UAT-INV-002
- UAT-INV-003
- UAT-PR-003
- UAT-PR-004
- UAT-BILL-002
- UAT-BILL-004
- UAT-PM-003
- UAT-PM-004
- UAT-RPT-001
- UAT-RPT-004

## 5) Non-Finalized Area Tracking
Mark as INFORMATIONAL in UAT summary (not hard fail) unless project scope says otherwise:
- Sales Credit Notes full module
- Expense direct GL posting integration
- Recurring Expense direct GL posting integration
- Vendor Credit direct GL posting integration

## 6) UAT Sign-Off Template
- Test cycle name:
- Organization:
- Date range tested:
- Total cases executed:
- Passed:
- Failed:
- Blocked:
- Critical defects:
- Accountant sign-off:
- QA sign-off:
- Product owner sign-off:
