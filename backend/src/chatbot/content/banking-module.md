---
title: Banking and Reconciliation Module
url: /docs/banking-module
---

# Banking and Reconciliation Module

The Banking Module manages financial accounts, bank statement imports, and reconciliation workflows to ensure the system's ledger matches real-world bank statements.

## Bank and Credit Card Accounts
Configure your liquid accounts to track cash flows:
- **Account Types**:
  - **Bank Account**: Checking, savings, or current accounts.
  - **Credit Card**: Liability accounts tracking card expenditures.
- **Attributes**: Account Name, Account Number, Bank Name, Routing/IFSC Code, Currency, and Opening Balance.
- **Ledger Link**: Every bank account maps directly to an Asset account in the Chart of Accounts, and credit cards map to a Current Liability account.

## Bank Statement Ingestion
To load transactions without manual entry:
- **Statement Import**: Upload CSV or Excel files directly from your bank.
- **Parsing**: The system parses date, description, check number, withdrawals (debits), deposits (credits), and running balances.
- **Uncategorized Inbox**: Imported lines are loaded into an "Uncategorized Transactions" list under the selected bank account.

## Transaction Matching & Reconciliation
Reconciliation is the process of matching bank-statement lines against transactions recorded in HAI Accounting:
- **Exact Match**: The system automatically suggests matching records based on exact date parity (or within a +-3 day window) and exact transaction amounts.
- **Supported Matches**: Matches against:
  - Recorded Expenses
  - Recorded Bills/Payments Made
  - Recorded Invoices/Payments Received
  - Bank Transfers (moving money between two bank accounts)
- **Direct Categorization**: If a bank charge (e.g. bank fee, interest charge) was not pre-recorded in the software, you can categorize it directly from the banking screen. This creates a corresponding ledger expense/income entry and matches it immediately.
- **Reconciliation Status**: Once matched, the transaction's status updates from "Uncleared" to "Cleared" and "Reconciled". The system displays the difference between the computed book balance and the actual bank balance (which should ideally be zero).
