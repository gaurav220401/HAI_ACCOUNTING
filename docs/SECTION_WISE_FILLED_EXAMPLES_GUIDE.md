# Section-Wise Filled Examples Guide

Version: 1.0  
Last Updated: 2026-04-03

Purpose:
This document is a practical data-entry guide. For each section, it shows a full sample with field values already filled so accountant and tester users can enter the same data and validate results.

How to use:
1. Open the module screen.
2. Enter values exactly as shown.
3. Save/submit with the status mentioned.
4. Verify expected output.

Important:
- Amounts below are sample values for UAT and training.
- Replace names/numbers for production.
- Keep date formats as per your organization settings.

## 0) First Setup Before Any Section (Do This First)

### 0.1 Setup Sequence
1. Create settings masters first (taxes, payment terms, payment modes, warehouses, reporting tags, expense categories, price lists).
2. Create chart of accounts and verify control accounts.
3. Enter opening balances with customer/vendor/stock supporting schedules.
4. Run Trial Balance check before entering daily transactions.

### 0.2 Settings Masters - Filled Setup Examples

Tax:
- name: GST 18%
- taxType: Tax
- rate: 18
- account: Tax Payable
- isActive: Yes

Payment Term:
- name: Net 30
- termType: net_days
- netDays: 30
- discountPercentage: 0
- isDefault: Yes
- isActive: Yes

Warehouse:
- name: Main Warehouse
- address: Site Area, Karachi
- isPrimary: Yes
- isActive: Yes

Sales Person:
- name: Salman
- email: salman@sales.local
- phone: +92-300-3333333
- commissionRate: 2
- isActive: Yes

Payment Mode:
- name: Online Transfer
- account: Habib Bank Limited
- isActive: Yes

Expense Category:
- name: Utility Expenses
- account: Utilities Expense
- description: Electricity, gas, internet
- isActive: Yes

Reporting Tag:
- name: HO-Admin
- color: #0F766E
- description: Head office administration costs
- isActive: Yes

Price List:
- name: Standard Sales Price 2026
- type: Sales
- currency: PKR
- isActive: Yes

### 0.3 Opening Balances - Filled Setup Example

| Sr.No | Particulars | Debit | Credit |
|---|---|---:|---:|
| 1 | Accounts Receivables | 2,350,000 | 0 |
| 2 | Accounts Payables | 0 | 1,550,000 |
| 3 | Stock | 15,937,500 | 0 |
| 4 | Buildings | 9,000,000 | 0 |
| 5 | Acc. Dep of Buildings | 0 | 1,500,000 |
| 6 | Vehicle | 6,000,000 | 0 |
| 7 | Acc. Dep of Vehicle | 0 | 600,000 |
| 8 | Machinery | 750,000 | 0 |
| 9 | Acc. Dep of Machinery | 0 | 150,000 |
| 10 | Cash in Hand | 850,000 | 0 |
| 11 | Habib Bank Limited | 7,000,000 | 0 |
| 12 | MCB Bank Limited | 3,500,000 | 0 |
| 13 | Accrued expenses | 0 | 53,000 |
| 14 | Capital Invested | 0 | 41,534,500 |
|   | Total | 45,387,500 | 45,387,500 |

Receivables breakup:
- Mureed: 1,000,000
- Rahim: 400,000
- Salman: 700,000
- Faizan: 250,000
- Total: 2,350,000

Payables breakup:
- Faiq: 900,000
- Wasiq: 650,000
- Total: 1,550,000

Stock breakup:
- MicroSoft Tablets: 100 x 55,000 = 5,500,000
- MicroSoft Laptops: 120 x 72,500 = 8,700,000
- MicroSoft Pen: 50 x 8,500 = 425,000
- MicroSoft KeyBoard: 75 x 17,500 = 1,312,500
- Total: 15,937,500

### 0.4 Setup Validation Checklist
- Debit total must equal credit total.
- Receivables party total must match Accounts Receivables.
- Payables party total must match Accounts Payables.
- Stock breakup total must match Stock account.
- Trial Balance should show zero difference.

## 1) Items - Fully Filled Examples

### 1.1 Item Example A (Goods)
Use for stock and sales testing.

Field values:
- name: MicroSoft Tablets
- sku: MST-TAB-100
- itemType: Goods
- unit: Nos
- itemGroup: Electronics
- description: Tablet model for bulk resale
- sellingPrice: 65000
- sellingDescription: 10 inch business tablet
- costPrice: 55000
- purchaseDescription: Bulk purchase tablet stock
- salesAccount: Sales
- purchaseAccount: Purchases
- taxPreference: Taxable
- tax: GST 18%
- hsnSacCode: 847130
- inventoryTracked: Yes
- stockOnHand: 100
- averageCost: 55000
- reorderPoint: 25
- preferredVendor: Prime Paper Suppliers
- warehouse: Main Warehouse
- isActive: Yes

Expected result:
- Item appears in quote, sales order, invoice, purchase order, bill.
- Inventory value = 100 x 55000 = 5500000.

### 1.2 Item Example B (Service)
Use for non-stock services.

Field values:
- name: Annual Support Contract
- sku: SRV-AMC-001
- itemType: Service
- unit: Year
- description: Annual software support
- sellingPrice: 120000
- costPrice: 0
- salesAccount: Service Income
- purchaseAccount: Service Expense
- taxPreference: Taxable
- tax: GST 18%
- inventoryTracked: No
- isActive: Yes

Expected result:
- Service item appears in invoice but not as stock movement.

## 2) Contacts - Fully Filled Examples

### 2.1 Customer Example
Field values:
- contactType: Customer
- displayName: Mureed Traders
- companyName: Mureed Traders Pvt Ltd
- firstName: Mureed
- lastName: Ahmad
- gstin: 22AAAAA0000A1Z5
- pan: AAAAA0000A
- email: accounts@mureedtraders.com
- phone: +92-21-111-111111
- mobile: +92-300-1111111
- website: www.mureedtraders.com
- taxTreatment: Taxable
- placeOfSupply: Sindh
- paymentTerms: Net 30
- accountsReceivable: Accounts Receivables
- openingBalance: 1000000
- currency: PKR
- billingAddress.city: Karachi
- shippingAddress.city: Karachi
- isActive: Yes

Expected result:
- Customer available in quotes, orders, invoices, receipts.

### 2.2 Vendor Example
Field values:
- contactType: Vendor
- displayName: Wasiq Supplies
- companyName: Wasiq Supplies Co
- firstName: Wasiq
- lastName: Khan
- gstin: 33BBBBB0000B1Z6
- pan: BBBBB0000B
- email: payable@wasiqsupplies.com
- phone: +92-21-222-222222
- mobile: +92-300-2222222
- taxTreatment: Taxable
- paymentTerms: Net 15
- accountsPayable: Accounts Payables
- openingBalance: 650000
- currency: PKR
- billingAddress.city: Karachi
- isActive: Yes

Expected result:
- Vendor available in purchase orders, bills, payments made.

## 3) Quotes - Fully Filled Example

Field values:
- customer: Mureed Traders
- quoteDate: 2026-04-03
- expiryDate: 2026-04-30
- referenceNumber: REF-Q-1001
- salesPerson: Salman
- subject: Tablet and accessory quotation
- item 1:
  - name: MicroSoft Tablets
  - quantity: 10
  - rate: 65000
  - discountPercent: 5
  - tax: GST 18%
- item 2:
  - name: MicroSoft KeyBoard
  - quantity: 20
  - rate: 17500
  - discountPercent: 0
  - tax: GST 18%
- discountType: percent
- discountValue: 0
- adjustmentLabel: Rounding
- adjustmentAmount: 0
- customerNotes: Delivery in 7 working days
- termsAndConditions: Payment due in 30 days
- status: Sent

Expected result:
- Quote status becomes Sent.
- No GL posting.

## 4) Sales Orders - Fully Filled Example

Field values:
- salesOrderNumber: SO-2026-001
- customer: Mureed Traders
- orderDate: 2026-04-03
- expectedShipmentDate: 2026-04-08
- paymentTerms: Net 30
- deliveryMethod: By Road
- salesPerson: Salman
- lineItems:
  - MicroSoft Tablets, qty 10, rate 65000
  - MicroSoft KeyBoard, qty 20, rate 17500
- shippingCharges: 10000
- adjustment: 0
- notes: Deliver to warehouse gate 2
- terms: Standard warranty terms
- status: APPROVED

Expected result:
- Sales order approved and ready for invoice conversion.

## 5) Invoices - Fully Filled Example

Field values:
- customer: Mureed Traders
- invoiceDate: 2026-04-03
- dueDate: 2026-05-03
- referenceNumber: INV-REF-1001
- orderNumber: SO-2026-001
- paymentTerms: Net 30
- salesPerson: Salman
- subject: Supply invoice April cycle
- item 1:
  - name: MicroSoft Tablets
  - quantity: 10
  - rate: 65000
  - discountPercent: 5
  - taxPercent: 18
- item 2:
  - name: MicroSoft KeyBoard
  - quantity: 20
  - rate: 17500
  - discountPercent: 0
  - taxPercent: 18
- discountType: amount
- discountValue: 5000
- taxType: none
- adjustmentLabel: Freight Adjustment
- adjustmentAmount: 10000
- customerNotes: Thank you for business
- termsAndConditions: Late fee applies after due date
- status: Sent

Expected result:
- Invoice posted and visible in receivables.
- GL impact appears in trial balance.

## 6) Recurring Invoices - Fully Filled Example

Field values:
- profileName: Monthly Support Billing
- customer: Rahim Enterprises
- startDate: 2026-04-01
- endDate: 2027-03-31
- neverExpires: No
- frequency: monthly
- paymentTerms: Net 15
- salesPerson: Salman
- subject: Monthly support retainer
- items:
  - Annual Support Contract, qty 1, rate 120000
- discountType: percent
- discountValue: 0
- taxType: none
- adjustmentAmount: 0
- deliveryMode: send
- status: active

Expected result:
- Next run date generated.
- Invoice generated on schedule.

## 7) Delivery Challans - Fully Filled Example

Field values:
- customer: Mureed Traders
- challanDate: 2026-04-03
- challanType: Sale
- referenceNumber: DC-REF-1001
- item 1: MicroSoft Tablets, qty 10, rate 65000
- item 2: MicroSoft KeyBoard, qty 20, rate 17500
- discountType: percent
- discountValue: 0
- taxAmount: auto
- adjustmentAmount: 0
- customerNotes: Handle goods carefully
- termsAndConditions: Return within 48 hours if damaged
- status: Open

Expected result:
- Challan generated for dispatch tracking.
- No GL posting.

## 8) Payments Received - Fully Filled Example

Field values:
- customer: Mureed Traders
- paymentDate: 2026-04-10
- paymentMode: Online Transfer
- depositedToAccount: Habib Bank Limited
- referenceNumber: UTR-PR-1001
- totalAmountReceived: 500000
- invoiceApplications:
  - invoice INV-2026-001, appliedAmount 400000
- notes: Partial payment received by bank transfer
- status: PAID

Expected result:
- Amount used for invoices: 400000
- Amount in excess: 100000
- Invoice due reduced by 400000

## 9) Purchase Orders - Fully Filled Example

Field values:
- vendor: Faiq Electronics
- purchaseOrderDate: 2026-04-04
- deliveryDate: 2026-04-09
- referenceNumber: PO-REF-1001
- deliveryAddressType: Organization
- paymentTerms: Net 15
- shipmentPreference: Cargo
- discountLevel: transaction
- lineItems:
  - MicroSoft Laptops, qty 20, rate 72500
  - MicroSoft Pen, qty 50, rate 8500
- discountPercent: 2
- taxType: none
- adjustmentLabel: Transport
- adjustmentAmount: 15000
- notes: Include warranty cards
- termsAndConditions: Payment release after quality check
- status: Open

Expected result:
- PO available for bill conversion.

## 10) Bills - Fully Filled Example

Field values:
- vendor: Faiq Electronics
- billDate: 2026-04-05
- dueDate: 2026-04-20
- billNumber: B-FAIQ-1001
- referenceNumber: FQ-INV-8891
- orderNumber: PO-2026-001
- paymentTerms: Net 15
- sourceOfSupply: Sindh
- destinationOfSupply: Sindh
- accountsPayable: Accounts Payables
- discountLevel: transaction
- lineItems:
  - name: MicroSoft Laptops
  - quantity: 20
  - rate: 72500
  - account: Purchases
- discountPercent: 0
- taxType: none
- adjustmentLabel: Freight
- adjustmentAmount: 10000
- notes: Goods received in good condition
- termsAndConditions: Standard vendor terms
- status: Open

Expected result:
- Bill posts to payables.
- Bill appears in aging and payable reports.

## 11) Recurring Bills - Fully Filled Example

Field values:
- profileName: Monthly Office Rent Bill
- vendor: Wasiq Supplies
- frequency: Monthly
- repeatEvery: 1
- startDate: 2026-04-01
- neverExpires: No
- endsOn: 2027-03-31
- paymentTerms: Net 15
- subject: Monthly office rent
- discountLevel: transaction
- lineItems:
  - name: Office Rent
  - quantity: 1
  - rate: 250000
  - account: Rent Expense
- taxType: none
- adjustmentAmount: 0
- notes: Auto generated recurring rent

Expected result:
- Bills auto-generated monthly.

## 12) Payments Made - Fully Filled Example

Field values:
- vendor: Faiq Electronics
- paymentDate: 2026-04-12
- paymentMode: Online Transfer
- paidThroughAccount: MCB Bank Limited
- referenceNumber: UTR-PM-1001
- totalAmountPaid: 600000
- billApplications:
  - bill B-FAIQ-1001, appliedAmount 550000
- notes: Partial vendor settlement
- status: PAID

Expected result:
- Amount used for bills: 550000
- Amount in excess: 50000
- Payable balance reduced accordingly

## 13) Vendor Credits - Fully Filled Example

Field values:
- vendor: Wasiq Supplies
- vendorCreditDate: 2026-04-15
- referenceBill: B-WASIQ-1002
- subject: Rate difference adjustment
- sourceOfSupply: Sindh
- destinationOfSupply: Sindh
- discountLevel: transaction
- lineItems:
  - name: MicroSoft Pen
  - quantity: 20
  - rate: 8500
  - account: Purchases
- discountPercent: 0
- taxType: none
- adjustmentLabel: Adjustment
- adjustmentAmount: 0
- notes: Credit issued for overcharged item
- status: OPEN

Expected result:
- Vendor credit available for bill application.

## 14) Expenses - Fully Filled Examples

### 14.1 Regular Expense Example
Field values:
- date: 2026-04-06
- amount: 4500
- expenseType: Regular
- expenseAccount: Fuel Expense
- paidThroughAccount: Cash in Hand
- vendor: Local Fuel Station
- notes: Delivery vehicle fuel
- isBillable: No
- status: Approved

Expected result:
- Expense in list with Approved status.

### 14.2 Mileage Expense Example
Field values:
- date: 2026-04-07
- expenseType: Mileage
- mileageCalcMethod: DistanceTravelled
- distance: 120
- mileageUnit: Km
- mileageRate: 30
- amount: auto calculated
- expenseAccount: Travel Expense
- paidThroughAccount: Cash in Hand
- notes: Client visit route
- status: Submitted

Expected result:
- Amount = 120 x 30 = 3600.

## 15) Recurring Expenses - Fully Filled Example

Field values:
- profileName: Monthly Internet Expense
- frequency: Monthly
- repeatEvery: 1
- startDate: 2026-04-01
- neverExpires: No
- endsOn: 2027-03-31
- expenseAccount: Internet Expense
- amount: 18000
- paidThroughAccount: Habib Bank Limited
- vendor: Connect ISP
- isBillable: No
- project: Head Office
- notes: Office broadband plan
- status: Active

Expected result:
- Expense auto-generates monthly.

## 16) Chart of Accounts - Fully Filled Example

Field values:
- name: Accounts Receivables
- code: AR-001
- rootType: Asset
- accountType: Accounts Receivable
- parent: Current Assets
- description: Trade receivable control account
- currency: PKR
- isGroup: No
- isActive: Yes

Expected result:
- Account available in customer and invoice mappings.

## 17) Journals - Fully Filled Example

Field values:
- date: 2026-04-30
- referenceNumber: JRN-APR-001
- description: Month-end depreciation entry
- lineItems:
  - Account: Depreciation Expense, debit 125000, credit 0
  - Account: Acc. Dep of Buildings, debit 0, credit 80000
  - Account: Acc. Dep of Vehicle, debit 0, credit 35000
  - Account: Acc. Dep of Machinery, debit 0, credit 10000
- notes: April month-end depreciation
- status: Posted

Validation:
- Total debit = 125000
- Total credit = 125000

Expected result:
- Journal posted and reflected in P and L and Balance Sheet.

## 18) Reports - Filled Filter Examples

### 18.1 Trial Balance
- asOf: 2026-04-30
Expected check:
- Total debit equals total credit.

### 18.2 Profit and Loss
- from: 2026-04-01
- to: 2026-04-30
Expected check:
- Net profit displayed for April activity.

### 18.3 Balance Sheet
- asOf: 2026-04-30
Expected check:
- Assets = Liabilities + Equity.

### 18.4 Control Reconciliation
- asOf: 2026-04-30
Expected check:
- AR GL versus customer outstanding difference near zero.
- AP GL versus vendor outstanding difference near zero.

## 19) Final UAT Execution Sequence (Recommended)

1. Configure settings masters (tax, terms, warehouse, payment modes).
2. Create chart of accounts and opening balances.
3. Enter customer and vendor masters.
4. Enter item masters.
5. Run sales cycle test (quote -> order -> invoice -> payment received).
6. Run purchase cycle test (PO -> bill -> payment made).
7. Run recurring modules test.
8. Run journal adjustment test.
9. Validate all reports.

Completion criteria:
- All forms save with provided sample data.
- Status transitions behave as expected.
- Report totals reconcile with transaction activity.
- Opening and control balances match supporting schedules.
