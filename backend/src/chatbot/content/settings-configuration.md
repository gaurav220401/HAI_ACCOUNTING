---
title: System Settings and Configurations
url: /docs/settings
---

# System Settings and Configurations

HAI Accounting provides granular settings panels to customize your organization profile, configure tax parameters, set opening balances, manage warehouses, establish multi-currency rates, enable automated payment gateways, and configure customer portal access.

## General Settings
- **Organization Profile**: Update the business name, contact email, phone, website, physical and shipping addresses.
- **Base Settings**: Specify base currency, timezone, date formats, and fiscal year boundaries.

## Currencies and Exchange Rates
- **Base vs Foreign Currencies**: Maintain transaction inputs in multiple currencies.
- **Exchange Rates Table**: Configure active exchange rates relative to the base currency.
- **Revaluation**: Automatically compute unrealized exchange gains or losses on foreign currency balances as of a specific date.

## Taxes and Compliance
- **Tax Rates**: Define and manage tax structures such as India GST (IGST, CGST, SGST) or custom flat tax rates.
- **HSN/SAC Codes**: Map default HSN/SAC codes and tax preferences directly to items in the product catalog for automated tax computations on quotes, sales orders, invoices, and bills.

## Opening Balances
When migrating from another accounting software, users can enter starting balances:
1. **Migration Date**: The date from the previous system as of which opening balances are posted.
2. **Account Balances**: Users input starting Debit or Credit amounts for all Chart of Accounts items across Assets, Liabilities, Equity, Revenue, and Expenses.
3. **Opening Balance Adjustment**: If total debits do not equal total credits, the system calculates the difference and automatically prompts the user to transfer the discrepancy to an "Opening Balance Adjustment" account, ensuring that the double-entry books remain balanced.

## Warehouse Management
- **Multi-Warehouse Support**: Create and manage multiple warehouses or storage locations.
- **Stock Movement**: Track inventory balances per warehouse and execute Move Orders between locations.

## PayU Payment Integration
- **Gateway Configuration**: Enter merchant key, salt, and API endpoint details to enable online payments.
- **Invoicing Integration**: Invoices generated in the system include direct payment links via PayU, allowing customers to pay instantly. Upon successful transaction callback, the system automatically records a Payment Received entry and marks the invoice as Paid or Partially Paid.

## Customer Portal
- **Client Access**: Enable portal access for customers to view, download, and pay outstanding invoices.
- **Quotes Approval**: Clients can log in to view pending quotes and directly accept or decline them, triggering automatic notifications to the sales team.

## Automated Reminders
- **Payment Reminders**: Configure automated email reminders for unpaid invoices before or after their due dates.
- **Custom Templates**: Define notification templates containing invoice links and amount details.
