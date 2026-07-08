---
title: Accounting and General Ledger Module
url: /docs/accounting-ledger
---

# Accounting and General Ledger Module

The core of HAI Accounting revolves around a robust, transaction-linked general ledger based on double-entry bookkeeping standards.

## Chart of Accounts (COA)
The Chart of Accounts defines the structure of your financial books:
- **Account Types**: Grouped under:
  - **Assets**: Cash, Bank, Accounts Receivable, Inventory Asset, Fixed Assets.
  - **Liabilities**: Accounts Payable, Customer Advances, Tax Payable (CGST, SGST, IGST, TCS, TDS).
  - **Equity**: Retained Earnings, Owner's Share Capital.
  - **Revenue**: Sales Revenue, Interest Income, Exchange Gain/Loss.
  - **Expenses**: Cost of Goods Sold (COGS), Rent, Salaries, Bank Charges, Depreciation, Travel.
- **Attributes**: Account Name, Account Code, Account Type, Currency, Description, and Active Status.

## Automated Ledger Postings
To ensure compliance and accuracy, users do not need to record accounting entries manually for standard business operations. The system automatically creates General Ledger (GL) entries in the background:
- **Invoices**: Debits Accounts Receivable; credits Sales Revenue and GST Payable.
- **Invoice Payments**: Debits Bank/Cash; credits Accounts Receivable.
- **Bills**: Debits Expense/Inventory Asset and GST Input Credit; credits Accounts Payable.
- **Bill Payments**: Debits Accounts Payable; credits Bank/Cash.

## Manual Journal Entries
Used for recording adjustments, corrections, depreciation, or tax provisions:
- **Rules**: Must contain at least two lines. Total Debits must exactly equal Total Credits.
- **Attributes**: Journal Date, Reference Number, Description, Journal Number, and Lines (Account, Debit, Credit, Narration, Contact).
- **Statuses**:
  - **Draft**: Saved but does not affect the general ledger or financial reports.
  - **Posted**: Locked and committed. General ledger entries are generated immediately.
  - **Reversed**: If adjustments are needed, a posted journal can be reversed. This generates canceling debits/credits to balance the ledger.

## Manual Journal Import Wizard
For migrating accounting history from spreadsheets:
- **Upload and Mapping**: Supports CSV and Excel formats. Map headers to Journal Header details (Date, Number, Ref, Description, Notes) and Line details (Account Name, Debit, Credit, Narration).
- **Multi-Row Grouping Schema**: Multiple lines in a sheet are grouped into a single multi-line Manual Journal entry. The grouping key priority is:
  1. Journal Number
  2. Reference Number
  3. Date + Description
- **Entity Resolution**: Resolves target Accounts case-insensitively by account name, code, or account number. Resolves Contacts case-insensitively by display name or company name.
- **Validation Checkpoints**:
  - Double Entry Check: Sum of debits must equal sum of credits.
  - Value Constraints: Debits and credits must be non-negative. A single line cannot have both a debit and credit. Both debit and credit cannot be zero.
  - Line Count Check: Journal must have at least 2 lines.
- **Overwrite Safety**: If duplicate journals are detected:
  - **Skip**: Ignores the duplicate rows.
  - **Overwrite**: Updates existing journal metadata and lines. If the existing journal is already `Posted`, the backend automatically reverses/cancels the old general ledger entries first, updates the journal contents, and posts the updated general ledger entries.
