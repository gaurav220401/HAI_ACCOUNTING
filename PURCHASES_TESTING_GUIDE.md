# Purchases Testing Guide (Non-Technical)

This guide is written for testers who do not know coding.

Use this document to test all Purchases sections from UI only:
- Vendors
- Expenses
- Recurring Expenses
- Purchase Orders
- Bills
- Recurring Bills
- Payments Made
- Vendor Credits

This guide focuses on:
- Which fields to fill
- Example values
- What should happen after save
- How one section links to another section

---

## 1) Before You Start Testing

Do this setup first:
1. Login with a test user.
2. Select or create an organization.
3. Confirm sidebar shows Purchases menu.
4. Keep one notebook or spreadsheet to track:
   - Test case name
   - Input used
   - Expected result
   - Actual result
   - Pass/Fail

Recommended sample master data:
1. 2 Vendors
2. 2 Expense accounts
3. 1 Bank account
4. 2 Items
5. 1 Payment term

### Master sample values testers can reuse everywhere

Organization sample:
- Organization Name: HAI Demo Traders Pvt Ltd
- Base Currency: INR
- Country: India
- Timezone: Asia/Kolkata
- Fiscal Year Start: April

User sample:
- User Name: Test Accountant
- User Email: tester.accountant@hai-demo.test

Accounts sample:
- Accounts Payable: Accounts Payable
- Expense Account 1: Office Supplies Expense
- Expense Account 2: Utilities Expense
- Bank Account: HDFC Current Account
- Cash Account: Cash in Hand

Payment terms sample:
- Net 15
- Net 30

Item samples:
- Item 1: A4 Printer Paper
- Item 2: Ink Cartridge Black

Vendor samples:
- Vendor A: Star Office Supplies
- Vendor B: NetConnect Services

Tax samples:
- TDS: Professional Fees 10%
- TCS: TCS on Sale 1%

---

## 2) Vendors Section

Screen path: Purchases -> Vendors

### What this section should do
- Create supplier records.
- Save contact, tax, payment, bank, and address details.
- Use these vendors in Bills, Purchase Orders, Expenses, Payments, and Vendor Credits.

Detailed expected behavior:
1. Tester should be able to create a vendor with only minimum required details.
2. Tester should be able to enrich same vendor later with GST, PAN, bank details, contacts, and addresses.
3. When vendor is saved, that exact vendor should become selectable in all purchases transaction forms.
4. Editing vendor should immediately reflect in vendor list and selection dropdowns.

Example of how it should work:
- If tester creates vendor "Star Office Supplies" in Vendors, the same vendor must appear in New Bill, New Purchase Order, New Expense, New Payment Made, and New Vendor Credit screens.

### Fields testers should check

Basic details:
- Salutation
- First Name
- Last Name
- Company Name
- Display Name
- Email
- Phone
- Mobile
- Language

Tax and compliance:
- GSTIN
- PAN
- MSME Registered
- TDS Category

Financial setup:
- Currency
- Accounts Payable
- Opening Balance
- Payment Terms

Address:
- Billing Address
- Shipping Address

Other:
- Contact Persons (add multiple)
- Bank Details (add multiple)
- Notes
- Documents upload

### Example input (simple)
- Company Name: Star Office Supplies
- Display Name: Star Office Supplies
- Email: accounts@staroffice.test
- Mobile: 9876543210
- Currency: INR
- Payment Terms: Net 30

### Expected result
1. Vendor saves successfully.
2. Vendor appears in Vendors list.
3. Same vendor appears in dropdowns of:
   - New Bill
   - New Purchase Order
   - New Expense
   - New Payment Made
   - New Vendor Credit

### Negative checks
1. Leave Display Name empty -> should show validation error.
2. Save with invalid required details -> should block save.

---

## 3) Expenses Section

Screen path: Purchases -> Expenses

### What this section should do
- Record normal expenses and mileage expenses.
- Support draft and submit flow.
- Support billable expense options.

Detailed expected behavior:
1. Tester should be able to create single normal expense (like office purchase).
2. Tester should be able to create mileage expense where distance and rate produce amount.
3. Tester should be able to use bulk mode for multiple expense rows in one go.
4. Saved expense should open correctly in detail and edit pages with same values.

Example of how it should work:
- If tester enters regular expense amount 2500, saved list row and detail screen should both show 2500 and selected account/vendor.

### Tabs/flows to test
- Expense
- Mileage
- Bulk Add

### Important fields

Common:
- Date
- Amount
- Expense Account
- Paid Through
- Vendor
- Notes
- Customer (if billable)
- Project (if billable)
- Attachments/receipts

Mileage:
- Distance
- Unit (Km/Mile)
- Mileage rate

Bulk:
- Add multiple lines
- Each line has account, notes, amount

### Example input
- Date: today
- Amount: 2500
- Expense Account: Office Supplies
- Vendor: Star Office Supplies
- Notes: Printer paper and files

### Expected result
1. Expense saves and appears in list.
2. Opening detail page shows same values.
3. Edit page updates values correctly.
4. Receipt links are visible if uploaded.

### Negative checks
1. Amount empty -> save blocked.
2. Date empty -> save blocked.
3. Enter letters in numeric fields -> should reject or auto-correct.

---

## 4) Recurring Expenses Section

Screen path: Purchases -> Recurring Expenses

### What this section should do
- Create repeated expense profile (weekly/monthly etc.).
- Allow stop/resume.
- Allow manual create expense from profile.

Detailed expected behavior:
1. Tester should create a recurring profile once and system should track next run date.
2. Manual create action should generate one normal expense from profile values.
3. Stop should pause future generation; Resume should reactivate it.
4. Profile list should always show current state (active/stopped).

Example of how it should work:
- For profile "Monthly Internet Bill" with amount 1800, manual create should create one expense entry with amount 1800 and linked vendor/account values.

### Fields testers should check
- Profile Name
- Repeat Every (frequency)
- Start Date
- Never Expires toggle
- End Date (when never expires is off)
- Expense Account
- Amount
- Paid Through
- Vendor
- Notes
- Billable toggle

### Example input
- Profile Name: Monthly Internet Bill
- Frequency: Month
- Start Date: first day of next month
- Amount: 1800
- Expense Account: Utilities
- Vendor: NetConnect Pvt Ltd

### Expected result
1. Profile saves and appears in recurring list.
2. Next run date is visible.
3. Stop action marks profile inactive.
4. Resume action reactivates profile.
5. Manual create creates a normal expense entry.

### Negative checks
1. Profile Name empty -> save blocked.
2. Amount empty -> save blocked.

---

## 5) Purchase Orders Section

Screen path: Purchases -> Purchase Orders

### What this section should do
- Create order to vendor before bill comes.
- Add line items and totals.
- Convert to bill.
- Clone order.
- Print or send email.

Detailed expected behavior:
1. Tester should create PO with one or more items and see total calculation.
2. PO should support draft/open lifecycle and preserve item details.
3. Convert to bill should copy meaningful PO details into bill flow.
4. Clone should create a new PO based on existing PO data for faster repeat entry.

Example of how it should work:
- PO created with item "A4 Printer Paper" quantity 20 and rate 250 should show matching line amount and should carry forward when converted to bill.

### Fields testers should check

Header details:
- Vendor Name
- Purchase Order Number
- Purchase Order Date
- Delivery Date
- Payment Terms
- Reference Number
- Source of Supply
- Destination of Supply

Item table:
- Item
- Account
- Description
- Quantity
- Rate
- Discount
- Amount

Summary:
- Subtotal
- Discount
- Tax selection
- Adjustment
- Total

Other:
- Notes
- Terms and Conditions
- Attachments
- Status

### Example input
- Vendor: Star Office Supplies
- PO Date: today
- One line item: Printer Paper, Qty 20, Rate 250
- Discount: 5%

### Expected result
1. Purchase Order is saved.
2. Number is generated if not manually set.
3. Calculations show correct total.
4. Convert to Bill creates draft/open bill with same line items.

### Negative checks
1. No line item -> save blocked.
2. Required date missing -> save blocked.

---

## 6) Bills Section

Screen path: Purchases -> Bills

### What this section should do
- Create payable bill from vendor.
- Track due amount and payment status.
- Support clone and void actions.

Detailed expected behavior:
1. Tester should be able to create bill with vendor, date, and item lines.
2. Bill should start with full due amount when no payment is applied.
3. Partial payment should reduce due and move status to Partially Paid.
4. Full payment should reduce due to zero and move status to Paid.
5. Void should be restricted when payment is already applied.

Example of how it should work:
- Bill total 20000, first payment 8000 should leave due 12000 and status Partially Paid; second payment 12000 should set due 0 and status Paid.

### Fields testers should check

Header:
- Vendor Name
- Bill Number
- Bill Date
- Due Date
- Payment Terms
- Reference Number
- Accounts Payable

Item table:
- Item
- Account
- Description
- Quantity
- Rate
- Discount
- Amount

Tax/summary:
- Tax Type
- Tax values
- Adjustment
- Total

Other:
- Notes
- Terms and Conditions
- Attachments
- Status

### Example input
- Vendor: Star Office Supplies
- Bill Date: today
- Due Date: today + 30 days
- One line item: Qty 10, Rate 500

### Expected result
1. Bill saves and appears in bills list.
2. Balance Due equals total when unpaid.
3. After payment allocation, status changes:
   - Open -> Partially Paid -> Paid
4. Void should work only when no payment applied.

### Negative checks
1. Bill date missing -> save blocked.
2. Edit financial values after payment -> should be restricted.

---

## 7) Recurring Bills Section

Screen path: Purchases -> Recurring Bills

### What this section should do
- Save repeating bill template.
- Create actual bill on schedule or manual trigger.
- Allow stop/resume profile.

Detailed expected behavior:
1. Tester should create recurring bill profile with vendor and line rows.
2. Manual create should generate one real bill in Bills section using profile values.
3. Stop should prevent further generation; Resume should allow generation again.
4. Profile edits should affect future generated bills.

Example of how it should work:
- If recurring profile has one line rate 12000, generated bill should also show line rate 12000 unless tester updates profile later.

### Fields testers should check
- Profile Name
- Vendor Name
- Frequency
- Start Date
- Never Expires / End Date
- Line Items
- Discount/Tax
- Notes
- Terms and Conditions
- Attachments

### Example input
- Profile Name: Monthly Software Subscription
- Vendor: SaaS Vendor Pvt Ltd
- Frequency: Month
- Start Date: next month start
- One line: Subscription Fee, Qty 1, Rate 12000

### Expected result
1. Profile appears in recurring bill list.
2. Manual create bill creates a normal bill entry.
3. Stop/Resume updates profile state.

### Negative checks
1. Vendor missing -> save blocked.
2. Profile name missing -> save blocked.

---

## 8) Payments Made Section

Screen path: Purchases -> Payments Made

### What this section should do
- Record payment done to vendor.
- Allocate payment to one or multiple bills.
- Track excess amount.

Detailed expected behavior:
1. Tester should enter payment details and save payment record.
2. In Bill Payment mode, tester should allocate one payment across one or many bills.
3. Allocation should reduce each selected bill due amount.
4. If payment is more than allocations, remaining amount should show as excess/advance.
5. Edit screen should preserve mode, allocations, and payment details.

Example of how it should work:
- Payment 10000 allocated 6000 and 4000 should make both selected bills reflect reduced dues; excess should be zero.

### Modes to test
- Bill Payment
- Vendor Advance

### Fields testers should check
- Payment Type
- Vendor Name
- Payment Number
- Amount Paid
- Payment Date
- Payment Mode
- Paid Through Account
- Deposit To Account
- Reference Number
- Notes
- Bill Allocation rows
- Attachment upload

### Example input
- Payment Type: Bill Payment
- Vendor: Star Office Supplies
- Amount Paid: 10000
- Payment Mode: Bank Transfer
- Allocate 6000 to Bill A and 4000 to Bill B

### Expected result
1. Payment saves and appears in list.
2. Bill allocation updates bill balance and status.
3. Excess amount is shown when paid amount > allocated amount.
4. Edit page reflects same values.

### Negative checks
1. Amount 0 -> save blocked.
2. Bill Payment mode with no bill allocation -> should warn/block when saving paid state.

---

## 9) Vendor Credits Section

Screen path: Purchases -> Vendor Credits

### What this section should do
- Record credit note received from vendor.
- Apply credit against open bills.
- Track remaining credit balance.

Detailed expected behavior:
1. Tester should create vendor credit with line items and totals.
2. Applying credit should reduce selected bill due amount.
3. Partial application should keep balance for future use.
4. Unapply should return amount back to credit balance and bill due.
5. Status should change according to usage (open, partially applied, closed).

Example of how it should work:
- Vendor credit 6000 applied 4000 should leave 2000 credit balance; applying remaining 2000 should close the credit.

### Fields testers should check
- Vendor Name
- Vendor Credit Number
- Vendor Credit Date
- Reference Bill
- Bill Type
- Source/Destination of Supply
- Item rows (item, account, description, qty, rate, tax)
- Discount mode and value
- Tax Type (none/TDS/TCS)
- Adjustment
- Notes
- Attachments

### Example input
- Vendor: Star Office Supplies
- Date: today
- Reference Bill: select one open bill
- One line: Returned damaged goods, Qty 2, Rate 1500

### Expected result
1. Credit note saves and appears in list.
2. Apply action reduces bill balance.
3. Credit status updates based on usage:
   - Open -> Partially Applied -> Applied/Closed
4. Unapply restores bill balance and credit balance.

### Negative checks
1. Vendor missing -> save blocked.
2. No line item -> save blocked.
3. Apply amount greater than available credit -> blocked.

---

## 10) Linkage Testing Between Sections (Very Important)

Run these end-to-end scenarios.

### Scenario A: Vendor -> Purchase Order -> Bill -> Payment
1. Create Vendor.
2. Create Purchase Order for that vendor.
3. Convert Purchase Order to Bill.
4. Create Payment Made and allocate to that bill.
5. Verify bill becomes Paid when fully allocated.

Expected:
- Same vendor appears in all screens.
- Amount and status are consistent in all linked screens.

### Scenario B: Vendor -> Bill -> Vendor Credit -> Apply
1. Create Vendor and Bill.
2. Create Vendor Credit for same vendor.
3. Apply credit to the bill.
4. Verify bill due decreases and credit balance decreases.

### Scenario C: Recurring Bill -> Generated Bill -> Payment
1. Create recurring bill profile.
2. Trigger manual bill creation.
3. Open created bill and verify values copied.
4. Pay that bill using Payments Made.

### Scenario D: Recurring Expense -> Generated Expense
1. Create recurring expense profile.
2. Trigger manual create expense.
3. Verify generated expense appears in Expenses list.

---

## 11) Tester Execution Template

Use this for each test case.

- Test Case Name:
- Section:
- Precondition:
- Steps:
- Input Data:
- Expected Result:
- Actual Result:
- Pass/Fail:
- Screenshot Link:
- Notes:

---

## 12) Field-by-Field Input Examples (Copy for Testing)

Use these example values while filling forms.

### A) Vendor form example values

Basic:
- Salutation: Mr.
- First Name: Raj
- Last Name: Mehta
- Company Name: Star Office Supplies
- Display Name: Star Office Supplies
- Email: accounts@staroffice.test
- Phone: 02244556677
- Mobile: 9876543210
- Language: English

Tax and compliance:
- GSTIN: 27ABCDE1234F1Z5
- PAN: ABCDE1234F
- MSME Registered: Yes
- TDS Category: Professional Fees

Financial:
- Currency: INR
- Accounts Payable: Accounts Payable
- Opening Balance: 0
- Payment Terms: Net 30

Address:
- Billing Address Line 1: 21 Market Road
- City: Mumbai
- State: Maharashtra
- PIN: 400001
- Country: India
- Shipping Address: Same as billing

Contact person row:
- Name: Priya Shah
- Email: priya@staroffice.test
- Mobile: 9898989898
- Is Primary: Yes

Bank details row:
- Bank Name: HDFC Bank
- Account Number: 50200011223344
- Re-enter Account Number: 50200011223344
- IFSC: HDFC0001234
- Branch: Fort Mumbai
- UPI: staroffice@hdfc

Notes:
- Preferred supplier for office consumables.

### B) Expense form example values

Regular expense:
- Date: 2026-03-26
- Amount: 2500
- Expense Account: Office Supplies Expense
- Paid Through: Cash in Hand
- Vendor: Star Office Supplies
- Notes: Purchased paper and markers for admin team.
- Is Billable: No

Mileage expense:
- Date: 2026-03-26
- Distance: 35
- Unit: Km
- Rate: 12
- Auto amount expected: 420
- Notes: Client meeting local travel.

Bulk expense row 1:
- Account: Utilities Expense
- Notes: Electricity backup fuel
- Amount: 1800

Bulk expense row 2:
- Account: Office Supplies Expense
- Notes: Pantry and stationery
- Amount: 1400

### C) Recurring expense form example values

- Profile Name: Monthly Internet Bill
- Repeat Every: Month
- Start Date: 2026-04-01
- Never Expires: No
- Ends On: 2027-03-31
- Expense Account: Utilities Expense
- Currency: INR
- Amount: 1800
- Paid Through: HDFC Current Account
- Vendor: NetConnect Services
- Notes: Broadband plan annual cycle.
- Is Billable: No

### D) Purchase order form example values

Header:
- Vendor Name: Star Office Supplies
- Purchase Order Date: 2026-03-26
- Delivery Date: 2026-03-30
- Payment Terms: Net 30
- Reference Number: PO-REF-2026-001
- Source of Supply: [MH] - Maharashtra
- Destination of Supply: [MH] - Maharashtra

Line row 1:
- Item: A4 Printer Paper
- Account: Office Supplies Expense
- Description: 75 GSM white paper bundle
- Quantity: 20
- Rate: 250
- Discount: 5%

Line row 2:
- Item: Ink Cartridge Black
- Quantity: 10
- Rate: 550

Summary:
- Discount Level: Transaction
- Tax Type: none
- Adjustment: 0

Notes:
- Urgent delivery before month end closing.

### E) Bill form example values

Header:
- Vendor Name: Star Office Supplies
- Bill Date: 2026-03-26
- Due Date: 2026-04-25
- Payment Terms: Net 30
- Reference Number: INV-SOS-1005
- Accounts Payable: Accounts Payable

Line row:
- Item: A4 Printer Paper
- Quantity: 10
- Rate: 500
- Description: Final invoice for March lot

Tax and summary:
- Tax Type: none
- Adjustment: 0
- Notes: Bill against PO-REF-2026-001

### F) Recurring bill form example values

- Profile Name: Monthly Software Subscription
- Vendor Name: NetConnect Services
- Frequency: Month
- Start Date: 2026-04-01
- Never Expires: Yes
- Payment Terms: Net 15

Line row:
- Description: Premium software plan
- Quantity: 1
- Rate: 12000

Tax:
- Tax Type: none

Notes:
- Auto-generated monthly payable.

### G) Payments made form example values

Bill payment mode:
- Payment Type: Bill Payment
- Vendor Name: Star Office Supplies
- Payment Number: auto-generated
- Amount Paid: 10000
- Payment Date: 2026-03-26
- Payment Mode: Bank Transfer
- Paid Through: HDFC Current Account
- Deposit To: leave blank
- Reference Number: UTR12345678
- Notes: Full settlement for two pending bills.

Bill allocation table example:
- Bill A allocation: 6000
- Bill B allocation: 4000

Vendor advance mode:
- Payment Type: Vendor Advance
- Amount Paid: 5000
- Expected: Amount in excess should show 5000 until adjusted.

### H) Vendor credit form example values

- Vendor Name: Star Office Supplies
- Vendor Credit Date: 2026-03-26
- Reference Bill: select one open bill
- Bill Type: Debit Note
- Vendor Credit Number: auto-generated
- Source of Supply: [MH] - Maharashtra
- Destination of Supply: [MH] - Maharashtra

Line row:
- Item: Ink Cartridge Black
- Description: Returned due to leakage
- Quantity: 2
- Rate: 1500
- Tax %: 0

Summary:
- Discount Mode: Amount
- Discount Value: 0
- Tax Type: none
- Adjustment: 0

Notes:
- Vendor confirmed replacement and credit issue.

---

## 13) Expected Output After Save (Quick Reference)

Vendor save:
- Vendor visible in Vendors list.
- Vendor selectable in all Purchases forms.

Expense save:
- Expense visible in Expenses list with entered amount/date.

Recurring expense save:
- Recurring profile visible.
- Next run date visible.

Purchase order save:
- PO visible in list.
- Total matches line calculations.

Bill save:
- Bill visible in Bills list.
- Balance Due equals Total when unpaid.

Recurring bill save:
- Profile visible in recurring bills list.

Payment save:
- Payment visible in Payments Made list.
- Bill balances reduce after allocation.

Vendor credit save:
- Credit visible in Vendor Credits list.
- Applying credit reduces bill due.

---

## 14) Quick Regression Checklist

Run this after any release:
1. Create one record in each Purchases section.
2. Edit one record in each section.
3. Search/filter list in each section.
4. Check status change in each section.
5. Check one full linked flow (PO -> Bill -> Payment).
6. Check one credit flow (Vendor Credit apply/unapply).
7. Check one recurring flow (manual trigger).

If all pass, Purchases module is stable for release.

---

## 15) Detailed Section-Wise Working With Full Samples

This section explains each Purchases module in more detail for testers.
Use this when you want to understand the business flow, not only field entry.

### 15.1 Vendors - How it works

Business purpose:
- Vendor is the base master used across all purchases transactions.
- Without a valid vendor, most purchase entries cannot continue.

How tester should validate flow:
1. Create new vendor with minimum fields.
2. Save and reopen vendor to confirm data persisted.
3. Edit vendor and add tax, address, bank details.
4. Go to Bills and Purchase Orders and verify this vendor appears in vendor dropdown.

Full sample scenario:
- Create vendor: Bright Stationers LLP
- Add contact person: Kiran Patel
- Add bank details and GSTIN
- Save vendor
- Create bill and choose Bright Stationers LLP

Expected final outcome:
- Vendor details are available in all Purchases forms.
- No duplicate or missing vendor issue in dropdown.

---

### 15.2 Expenses - How it works

Business purpose:
- Expenses capture day-to-day spending.
- Can be standard expense, mileage expense, or bulk entries.

How tester should validate flow:
1. Add one regular expense.
2. Add one mileage expense.
3. Add one bulk expense with at least 2 rows.
4. Open each saved record and verify amount/date/account.

Full sample scenario:
- Regular: Office tea and snacks, amount 1200
- Mileage: 32 Km, rate 12, expected amount 384
- Bulk rows: Fuel 1800, Printing 950

Expected final outcome:
- All entries appear in list view.
- Amount calculations and status are correct.

---

### 15.3 Recurring Expenses - How it works

Business purpose:
- Used for fixed repetitive expenses like rent, internet, or subscription.

How tester should validate flow:
1. Create recurring expense profile.
2. Verify profile appears with next run date.
3. Use manual create action to generate one real expense.
4. Stop profile and verify status changed.
5. Resume profile and verify status returns active.

Full sample scenario:
- Profile: Internet Lease Line
- Frequency: Monthly
- Amount: 3500
- Start date: 2026-04-01
- Manually create one expense

Expected final outcome:
- Generated expense appears in expense list.
- Profile stop and resume behave correctly.

---

### 15.4 Purchase Orders - How it works

Business purpose:
- Purchase Order confirms intent to buy from vendor before bill comes.
- Later it can be converted into bill.

How tester should validate flow:
1. Create PO with vendor and 2 line items.
2. Validate line totals and grand total.
3. Save as Open.
4. Convert PO to Bill.
5. Open converted bill and verify copied data.

Full sample scenario:
- Vendor: Bright Stationers LLP
- Item 1: A4 paper, qty 50, rate 240
- Item 2: Stapler pins, qty 20, rate 45
- Discount 5 percent transaction level
- Convert PO to Bill

Expected final outcome:
- PO number generated.
- Converted bill contains same item details and values.

---

### 15.5 Bills - How it works

Business purpose:
- Bill is vendor payable document.
- Payment and vendor credit are applied against bill.

How tester should validate flow:
1. Create bill for a vendor.
2. Confirm balance due equals total.
3. Create payment and allocate partial amount.
4. Check status becomes Partially Paid.
5. Allocate remaining payment and verify Paid status.

Full sample scenario:
- Bill total: 20000
- First payment: 8000
- Second payment: 12000

Expected final outcome:
- Status changes Open -> Partially Paid -> Paid.
- Balance due becomes zero after full payment.

---

### 15.6 Recurring Bills - How it works

Business purpose:
- Template for periodic vendor bills.
- System can generate bill repeatedly from one profile.

How tester should validate flow:
1. Create recurring bill profile with one line item.
2. Verify profile appears in list.
3. Trigger manual bill generation.
4. Open generated bill and verify values.
5. Stop and resume profile.

Full sample scenario:
- Profile: Monthly SaaS License
- Vendor: NetConnect Services
- Amount: 12000
- Frequency: Monthly

Expected final outcome:
- Generated bill appears under normal Bills list.
- Stop/resume affects future generation state.

---

### 15.7 Payments Made - How it works

Business purpose:
- Records payment sent to vendor.
- Can settle one bill, multiple bills, or keep vendor advance.

How tester should validate flow:
1. Open new payment form.
2. Select Bill Payment mode.
3. Enter amount and allocate across 2 bills.
4. Save payment.
5. Open both bills and verify reduced due amounts.

Full sample scenario:
- Total payment: 25000
- Bill A allocation: 10000
- Bill B allocation: 15000

Expected final outcome:
- Payment appears in payment list.
- Bill balances updated exactly with allocation values.

Vendor advance sample:
- Create payment in Vendor Advance mode with no bill allocation.
- Expected: amount remains in excess and can be used later.

---

### 15.8 Vendor Credits - How it works

Business purpose:
- Vendor Credit reduces payable amount when vendor gives credit note.

How tester should validate flow:
1. Create vendor credit with one or more lines.
2. Save as Open.
3. Apply credit to one open bill.
4. Verify bill due reduced.
5. Unapply and verify reversal.

Full sample scenario:
- Vendor credit total: 6000
- Apply 4000 to bill
- Remaining credit: 2000
- Apply remaining 2000 to another bill

Expected final outcome:
- Credit status moves to Partially Applied then Closed/Applied.
- Bill due values reduce correctly.

---

### 15.9 Combined End-to-End Mega Sample (Tester Demo)

Use this single flow for complete Purchases UAT:
1. Create vendor: Delta Industrial Supplies.
2. Create Purchase Order for vendor.
3. Convert PO to Bill.
4. Create one Vendor Credit and apply partial credit to bill.
5. Create Payments Made and settle remaining balance.
6. Verify bill final status Paid.
7. Create recurring bill for same vendor and generate one bill manually.
8. Create one expense linked to same vendor.

Final expected outcome:
- All Purchases modules are linked and consistent.
- Vendor appears everywhere.
- Totals, balances, and statuses stay correct after each step.
