---
title: Getting Started with HAI Accounting
url: /docs/getting-started
---

# Getting Started with HAI Accounting

Welcome to HAI Accounting, a premium cloud-based ERP and accounting platform designed to streamline financial operations, tracking, and compliance. This guide covers account setup, organization management, user roles, and core configurations.

## Platform Overview
HAI Accounting is structured around standard double-entry bookkeeping, multi-currency operations, and automated document processing. It features a modern, teal-themed user interface, responsive sidebars, real-time dashboard analytics, and modular controls for sales, purchases, inventory, banking, and time tracking.

## Signing Up and Logging In
To start using the platform, users must create an account.
1. **Signup**: Provide your display name, email address, and a secure password. You can also sign up using authorized identity providers.
2. **Login**: Authenticate using your email and password. The login screen features a responsive split-screen layout with a landscape SaaS dashboard graphic cover panel displaying Indian Rupee (₹) charts.
3. **Authentication Mechanism**: Under the hood, authentication and session state are managed securely via Firebase Auth, ensuring fast and reliable token-based security.

## Organization Management
All transactions and entities exist within the scope of an Organization. A single user account can create or be invited to multiple organizations.
1. **Initial Setup**: When launching the app for the first time, you will be prompted to create your first organization. You will need to provide:
   - Organization Name
   - Primary Address & Country
   - Base Currency (e.g., INR - Indian Rupee, USD - US Dollar)
   - GSTIN (Goods and Services Tax Identification Number - optional for Indian compliance)
2. **Switching Organizations**: The organization switcher is accessible in two places:
   - **Header Dropdown**: At the top right of the page header.
   - **User Dropdown**: In the user account widget at the bottom of the sidebar.
   Switching an organization immediately updates your active context, reloading all lists, dashboards, and financial accounts.

## Access Control and User Roles
To ensure secure operations and segregation of duties, HAI Accounting employs a role-based access control (RBAC) model. Default system roles include:
- **Admin**: Full read/write access to all settings, logs, invoices, bills, inventory, bank accounts, and user management.
- **Accountant**: Access to general ledger entries, chart of accounts, manual journals, banking, and financial reports.
- **Sales Manager**: Permission to manage customers, quotes, sales orders, invoices, and payments received.
- **Purchase Manager**: Permission to manage vendors, expenses, purchase orders, receives, bills, and payments made.
- **Inventory Manager**: Permission to manage items, warehouses, stock adjustments, move orders, packaging, putaways, and shipments.
- **Time Tracker**: Access restricted to projects, tasks, timesheet entries, and hours logs.
- **Banking Manager**: Access to manage bank/credit card accounts, statement imports, and reconciliation.

## Currencies and Exchange Rates
HAI Accounting supports global operations with a robust multi-currency engine:
- **Base Currency**: The main currency in which your books of accounts are maintained (configured at organization creation).
- **Foreign Currency**: Transactions (e.g., invoices, bills) can be created in foreign currencies. The system automatically fetches or allows manual override of the exchange rate relative to the base currency.
- **Currency Adjustments**: Users can post Base Currency Adjustments to record gains or losses from fluctuating exchange rates when settling outstanding accounts receivable or payable.
