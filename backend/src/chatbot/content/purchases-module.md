---
title: Purchases and Payables Module
url: /docs/purchases-module
---

# Purchases and Payables Module

The Purchases Module handles supplier profiles, ordering stock, recording operational expenses, managing unpaid bills, and processing outbound payments.

## Vendor Management
A vendor record tracks profiles of suppliers:
- **Details**: Company Name, Contact Name, Email, Phone, Currency, Address, and Payment Terms.
- **Tax Details**: GST Treatment (e.g., Registered Business, Unregistered, Composite, Overseas), GSTIN, and TDS preferences (Tax Deducted at Source).

## Expenses
Used to record immediate, out-of-pocket expenses (like office supplies, travel, or quick cash purchases).
- **Attributes**: Expense Date, Amount, Payment Account (Cash/Bank), Expense Category (e.g., Travel, Meals, Rent), and Vendor.
- **Receipt Upload**: Receipts can be uploaded directly. The system can parse metadata from them via the OCR engine.
- **Billable Expenses**: You can mark an expense as "Billable" and associate it with a specific customer, allowing you to easily include it in the customer's next invoice.

## Recurring Expenses
For repeating operational expenditures (e.g., office rent, SaaS subscriptions, utility services):
- **Schedule**: Define the frequency (weekly, monthly, custom intervals), start date, and end date.
- **Automation**: The scheduler automatically runs in the background and posts the transaction journal entry when the date is reached.

## Purchase Orders
A Purchase Order (PO) is a formal request sent to a vendor, committing to buy specific items at agreed rates.
- **Attributes**: PO Number, Vendor, Delivery Date, Items, Warehouse, Terms, and Ship To details.
- **Statuses**: Draft, Open, Received, Billed, Closed, and Canceled.
- **Fulfillment Flow**: When the items arrive, the PO can be converted into a Purchase Receive. When billed by the vendor, the PO is converted into a Bill.

## Purchase Receives
Tracks the physical receipt of ordered stock at the target warehouse.
- **Inventory Action**: Saving a Purchase Receive updates the items' "Stock on Hand" immediately (increasing inventory counts).
- **Discrepancies**: Allows receiving partial quantities if items are back-ordered or rejected due to damage.

## Bills
A Bill represents an invoice received from a vendor indicating an amount owed.
- **Ledger Impact**: Creditor balances are increased (Accounts Payable) and expense or inventory assets are debited.
- **Tax Calculations**: Automatically applies tax rates, showing CGST/SGST/IGST calculations on the line items.
- **Statuses**: Draft, Open, Paid, Partially Paid, Overdue, and Void.

## Recurring Bills
Similar to recurring expenses, but creates an outstanding supplier Bill on a scheduled basis rather than an immediate cash outflow.

## Payments Made
Settling outstanding bills with suppliers:
- **Attributes**: Payment Date, Outflow Account (Bank/Cash), Reference Number, Amount, and Exchange Rate.
- **Allocation**: The payment amount is allocated across one or more open vendor bills.
- **Ledger Impact**: Debits Accounts Payable and credits the selected Bank/Cash account.

## Vendor Credits
Record returns of goods or discounts given by a vendor after a bill has been created.
- **Allocation**: Vendor Credits can be applied against subsequent bills from the same vendor to reduce the payment due, or recorded as a refund from the vendor (increasing the bank balance).
