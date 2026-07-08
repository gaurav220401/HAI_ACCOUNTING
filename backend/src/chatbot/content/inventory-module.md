---
title: Inventory and Items Module
url: /docs/inventory-module
---

# Inventory and Items Module

The Inventory Module is designed to manage physical goods, inventory valuation, tracking stock movements, warehouse locations, and bulk imports.

## Items catalog
Every product or service must be set up in the Items catalog:
- **Product Type**: 
  - **Goods**: Physical products that are tracked in inventory. Requires setting up inventory account, stock on hand, and average unit costs.
  - **Service**: Non-physical items (e.g. consulting, shipping fee). No inventory is tracked.
- **Attributes**: Item Name, SKU (Stock Keeping Unit - unique identifier), Description, Units (e.g. pcs, kgs, boxes), Brand, Manufacturer, UPC, EAN, and dimensions.
- **Pricing & Accounts**:
  - **Sales Information**: Selling price and Sales Account (revenue).
  - **Purchase Information**: Cost price and Cost of Goods Sold (COGS) Account.
  - **Inventory Information**: Inventory Asset Account (only for Goods).
- **Tax Settings**: Inter-state tax, intra-state tax, HSN/SAC code, and exemption reasons if applicable.

## Inventory Adjustments
When discrepancies occur between physical stock and software stock (due to theft, damage, or counting errors), you record an Inventory Adjustment:
- **Types**:
  - **Quantity Adjustment**: Adjusts the physical units on hand. Automatically recalculates inventory valuation based on the item's average unit cost.
  - **Value Adjustment**: Directly changes the book value of inventory without altering quantity (e.g., writing down inventory value).
- **Accounting**: Debits or credits the Inventory Adjustment Expense account and updates the Inventory Asset account.

## Move Orders
Used to transfer physical goods between different warehouses or locations:
- **Flow**: Move orders track the item, quantity, source warehouse, destination warehouse, transfer date, and status (e.g., Draft, In Transit, Completed).
- **Stock Impact**: Reduces stock at the source warehouse and increases stock at the destination warehouse upon completion.

## Packages and Putaways
- **Packaging**: Group items into custom packages for delivery. Allows specifying package length, width, height, and weight (packaged units).
- **Putaways**: Orchestrating where incoming stock is stored in a warehouse (bin location mapping).

## Warehouses
- Manage multiple warehouse locations under one organization.
- Track stock counts separately for each warehouse.
- Define a primary warehouse for automated purchase receive drops.

## Item Import Wizard
To import your inventory database in bulk from CSV, XLS, or XLSX files:
- **Step 1: Choose File**: Upload the sheet. The client parses headers locally using `xlsx`.
- **Step 2: Map Fields**: Map columns in your spreadsheet to Zoho Inventory schema fields (grouped into Item Details, Sales Info, Purchase/Inventory Info, Dimensions, and Tax Details). Mapping configurations can be saved in local storage.
- **Step 3: Preview**: Shows ready rows and rows with validation errors.
- **Duplicate Handling**:
  - **Skip**: Ignores rows where the SKU already exists.
  - **Overwrite**: Updates all fields on the existing database item, computes opening stock valuation adjustments, and posts difference general ledger updates.
- **Valuation Calculation**: If average cost is not mapped but opening stock value and stock on hand are provided, average cost is computed as `openingStockValue / stockOnHand`.
