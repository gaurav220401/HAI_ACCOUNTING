# Indian GST & Legal Compliance Audit — HAI Accounting

> **Date:** July 2026 | **Scope:** Full O2C workflow, GST, TDS/TCS, Inventory, E-Way Bill, E-Invoicing
> **Disclaimer:** This document is for internal reference. Consult a qualified CA/tax professional before making compliance-critical decisions.

---

## Table of Contents

1. [O2C Workflow Mapping](#1-order-to-cash-workflow-mapping)
2. [GST Tax Invoice Compliance (Section 31 / Rule 46)](#2-gst-tax-invoice-compliance)
3. [Delivery Challan Compliance (Rule 55)](#3-delivery-challan-compliance)
4. [CGST / SGST / IGST Determination](#4-cgst-sgst-igst-determination)
5. [HSN / SAC Code Requirements](#5-hsn-sac-code-requirements)
6. [TDS & TCS Compliance](#6-tds-tcs-compliance)
7. [E-Way Bill Integration](#7-e-way-bill-integration)
8. [E-Invoicing (IRN / QR Code)](#8-e-invoicing)
9. [Credit Note & Debit Note (Section 34)](#9-credit-note-debit-note)
10. [Inventory & Books of Accounts (Section 35 / Rule 56)](#10-inventory-books-of-accounts)
11. [GST Return Filing Readiness](#11-gst-return-filing-readiness)
12. [Dual-Path Sales Order Architecture](#12-dual-path-sales-order-architecture)
13. [Compliance Gap Summary](#13-compliance-gap-summary)
14. [Recommended Roadmap](#14-recommended-roadmap)

---

## 1. Order-to-Cash Workflow Mapping

### Standard B2B MSME Lifecycle

```
[Purchase Order] → [Sales Order] → [Delivery Challan] → [Tax Invoice] → [Payment Received]
                                          │
                                   (Stock Leaves)
```

### Current Software Coverage

| Step | Document | Model Exists | Controller | Status Tracking | Compliance |
|------|----------|:---:|:---:|:---:|:---:|
| 1 | Purchase Order (incoming) | ✅ `purchase-order.model.ts` | ✅ | ✅ Draft→Open→Received→Billed→Closed | ✅ |
| 2 | Sales Order | ✅ `sales-order.model.ts` | ✅ | ✅ DRAFT→APPROVED→INVOICED→CLOSED | ✅ |
| 3 | Picking & Packing | ✅ `package.model.ts` | ✅ | ✅ via Packages & Move Orders | ✅ |
| 4 | Delivery Challan | ✅ `delivery-challan.model.ts` | ✅ | ✅ Draft→Open→Delivered→Returned | ✅ |
| 5 | Goods Receipt Note | ⚠️ Partially | ✅ `purchase-receive.model.ts` (buy-side) | ⚠️ | ⚠️ |
| 6 | Tax Invoice | ✅ `invoice.model.ts` | ✅ | ✅ Draft→Sent→Paid | ✅ |
| 7 | Payment & Receipt | ✅ `payment-received.model.ts` | ✅ | ✅ DRAFT→PAID→VOID | ✅ |

### Dual-Path Architecture (SO → Invoice vs SO → DC → Invoice)

| Path | Description | Implemented |
|------|-------------|:---:|
| **Path A** (Standard Sale) | SO → Convert to Tax Invoice | ✅ `sales-order.controller.ts` has `convertToInvoice` |
| **Path B** (Deferred Sale) | SO → Convert to Delivery Challan → Convert to Invoice | ✅ DC controller has `convertToInvoice` |

**Verdict:** ✅ The dual-path architecture is correctly implemented.

---

## 2. GST Tax Invoice Compliance

### Legal Requirements (Section 31 CGST Act / Rule 46 CGST Rules)

| # | Mandatory Field | In Schema | Field Name | Status |
|---|----------------|:---------:|------------|:------:|
| 1 | Supplier Name, Address, GSTIN | ✅ | `organization.name`, `address`, `taxId` | ✅ |
| 2 | Unique Invoice Number (≤16 chars) | ✅ | `invoiceNumber` (format `INV-000001`) | ✅ |
| 3 | Date of Issue | ✅ | `invoiceDate` | ✅ |
| 4 | Recipient Name, Address, GSTIN | ✅ | `customerId` → Contact with `gstin`, `billingAddress` | ✅ |
| 5 | Place of Supply (state + code) | ⚠️ | Not on Invoice model directly | ⚠️ |
| 6 | HSN/SAC Code | ✅ | `items[].hsnSacCode` | ✅ |
| 7 | Description of Goods/Services | ✅ | `items[].name`, `items[].description` | ✅ |
| 8 | Quantity & Unit | ⚠️ | `items[].quantity` exists; UQC/unit not on invoice line | ⚠️ |
| 9 | Taxable Value | ✅ | `subTotal`, item-level `amount` | ✅ |
| 10 | Tax Breakdown (CGST/SGST/IGST) | ⚠️ | Single `taxAmount` field; no split into CGST/SGST/IGST columns | ⚠️ |
| 11 | Reverse Charge Statement | ❌ | No `isReverseCharge` on Invoice model | ❌ |
| 12 | Signature / Digital Signature | N/A | PDF generation handles this | N/A |
| 13 | QR Code / IRN (E-invoicing) | ❌ | Not implemented | ❌ |

### Gaps Identified

> [!WARNING]
> **Critical Gap — Tax Breakdown:** The invoice model stores a single `taxAmount`. For GST compliance, the invoice (and PDF) must show the split: CGST amount, SGST amount, or IGST amount separately. The `item-tax-linkage.service.ts` correctly determines inter/intra-state supply, but the result isn't persisted as separate CGST/SGST/IGST amounts on the invoice line items.

> [!WARNING]
> **Place of Supply on Invoice:** The `placeOfSupply` field exists on Sales Order and Quote models but is **missing from the Invoice model**. This is legally required on every tax invoice.

> [!IMPORTANT]
> **Reverse Charge Mechanism:** The Contact model supports `ReverseCharge` as a `taxTreatment` value, and `recurring-bill.model.ts` has `isReverseCharge`. However, the Invoice model lacks this field and a statement like "Tax payable under reverse charge" cannot be printed.

---

## 3. Delivery Challan Compliance

### Legal Requirements (Rule 55 CGST Rules)

| # | Mandatory Field | In Schema | Status |
|---|----------------|:---------:|:------:|
| 1 | Serial Number (≤16 chars) | ✅ `challanNumber` (DC-00001) | ✅ |
| 2 | Date of Issue | ✅ `challanDate` | ✅ |
| 3 | Consignor Name, Address, GSTIN | ✅ via Organization | ✅ |
| 4 | Consignee Name, Address, GSTIN | ✅ via `customerId` → Contact | ✅ |
| 5 | HSN Code + Description | ✅ `items[].hsnSacCode`, `items[].name` | ✅ |
| 6 | Quantity | ✅ `items[].quantity` | ✅ |
| 7 | Taxable Value | ✅ `items[].amount` | ✅ |
| 8 | Tax Rate & Amount | ✅ `items[].taxPercent`, `items[].taxAmount` | ✅ |
| 9 | Place of Supply (inter-state) | ❌ Not on DC model | ❌ |
| 10 | Challan Type | ✅ `challanType` enum (Job Work, Supply on Approval, etc.) | ✅ |
| 11 | Triplicate Copies | N/A | PDF printing concern | N/A |

### Challan Types (Rule 55 Compliance)

The `ChallanType` enum correctly maps to legal categories:
- `"Supply of Liquid Gas"` — Rule 55(1)(a)
- `"Job Work"` — Rule 55(1)(b)
- `"Supply on Approval"` — Rule 55(1)(c)
- `"Others"` — Rule 55(1)(d)

**Verdict:** ✅ Challan types are legally compliant.

### Convert to Invoice Flow

The `convertToInvoice` endpoint in `delivery-challan.controller.ts` correctly:
- ✅ Pulls all line items from the challan
- ✅ Creates a new Invoice with proper totals
- ✅ Updates `invoiceStatus` to `"INVOICED"` and links `invoiceId`
- ✅ Syncs the linked Sales Order status
- ⚠️ Does NOT trigger GL entries (accounting ledger) during conversion — the invoice is created as `"Draft"` status

> [!NOTE]
> **Accounting entries** (AR increase, Sales Revenue increase) happen when the invoice moves from Draft to a posted status (Sent/Paid), not at the moment of conversion. This is acceptable but should be documented for users.

---

## 4. CGST / SGST / IGST Determination

### Current Implementation: `item-tax-linkage.service.ts`

The service correctly:
- ✅ Resolves the organization's state from `organization.address.state`
- ✅ Resolves the customer's state from `contact.placeOfSupply`, `shippingAddress.state`, or `billingAddress.state`
- ✅ Determines `interState` (boolean) by comparing normalized states
- ✅ Selects appropriate tax: `interStateTaxId` (IGST) or `intraStateTaxId` (CGST+SGST)
- ✅ Falls back to legacy `taxId` with rate-matching
- ✅ Supports state code formats: `[MH]`, `(27)`, `MH`, `27`, full names

### Item Model Tax Fields

```
taxId              — Legacy/fallback tax
intraStateTaxId    — CGST+SGST group (same state)
interStateTaxId    — IGST tax (different state)
```

**Verdict:** ✅ The inter/intra-state tax selection logic is well-implemented.

> [!IMPORTANT]
> **Gap:** While the correct tax is selected, the invoice/challan line items store only a single `taxPercent` and `taxAmount`. For GSTR-1 filing and PDF compliance, these need to be split into CGST/SGST or IGST columns.

---

## 5. HSN / SAC Code Requirements

### Legal Requirements

| Turnover (AATO) | Minimum HSN Digits |
|-----------------|:------------------:|
| Up to ₹5 Crore | 4 digits |
| Above ₹5 Crore | 6 digits |
| Imports/Exports | 8 digits |

### Current Implementation

- ✅ `hsnSacCode` field exists on: Item model, Invoice items, Quote items, Sales Order items, Delivery Challan items, Bill items, Credit Note items
- ✅ Item form allows HSN/SAC input
- ❌ **No validation** enforcing minimum digit count based on turnover
- ❌ **No HSN master database** for dropdown selection / validation

> [!TIP]
> Add a setting in Organization for turnover bracket, then validate HSN digit count accordingly during invoice creation.

---

## 6. TDS & TCS Compliance

### Current Implementation

| Feature | Model | Controller | Status |
|---------|:-----:|:----------:|:------:|
| TDS Tax Master | ✅ `tds-tax.model.ts` | ✅ `tds-tax.controller.ts` | ✅ |
| TCS Tax Master | ✅ `tcs-tax.model.ts` | ✅ `tcs-tax.controller.ts` | ✅ |
| TDS on Invoice | ✅ `taxType: "TDS"`, `tdsId` | ✅ | ✅ |
| TCS on Invoice | ✅ `taxType: "TCS"`, `tcsId` | ✅ | ✅ |
| TDS on Bills | ✅ Same fields | ✅ | ✅ |
| TDS on Purchase Orders | ✅ Same fields | ✅ | ✅ |
| TDS on Sales Orders | ✅ Same fields | ✅ | ✅ |
| Section Code tracking | ✅ `sectionCode`, `sectionDescription` | ✅ | ✅ |
| Payable/Receivable accounts | ✅ `tdsPayableAccountId`, `tdsReceivableAccountId` | ✅ | ✅ |
| Higher rate flag (no PAN) | ✅ `isHigherRate` | ✅ | ✅ |
| Applicability date range | ✅ `applicableStartDate`, `applicableEndDate` | ✅ | ✅ |

### Legal Notes

- **Section 194Q** (TDS on Purchase): Buyer with turnover > ₹10 Cr deducts 0.1% on purchases > ₹50L from a seller. The software supports this via the TDS master.
- **Section 206C(1H)** (TCS on Sale): **Omitted from April 1, 2025.** The software still supports TCS which is fine for historical transactions and other TCS provisions.

**Verdict:** ✅ TDS/TCS implementation is comprehensive.

---

## 7. E-Way Bill Integration

### Legal Requirements

| Condition | E-Way Bill Required |
|-----------|:-------------------:|
| Inter-state movement, value > ₹50,000 | Mandatory |
| Intra-state movement, value > ₹50,000 (varies by state) | Mandatory |
| Movement with Delivery Challan > threshold | Mandatory |
| Invoice-based dispatch > threshold | Mandatory |

### Current Implementation

- ❌ **No E-Way Bill model** in the database
- ❌ **No E-Way Bill generation API** integration
- ❌ **No automatic threshold check** (₹50,000 trigger)
- ⚠️ UI has a placeholder button "Add e-Way Bill Details" on invoice detail page but no functionality

> [!CAUTION]
> **Critical Missing Feature:** E-Way Bill generation is legally mandatory for goods movement above ₹50,000. The software currently has no integration with the E-Way Bill portal (ewaybillgst.gov.in). This is a significant compliance gap for any MSME moving physical goods.

### Recommended Implementation

1. Add `EWayBill` model with fields: ewbNumber, ewbDate, validUpto, vehicleNumber, transporterGSTIN, transportMode, distance
2. Auto-trigger when Invoice or DC total > ₹50,000
3. Integrate with NIC E-Way Bill API for generation
4. Link to Invoice/Delivery Challan via `ewayBillId`

---

## 8. E-Invoicing

### Legal Requirements

| Turnover Threshold | E-Invoicing Required |
|-------------------|:--------------------:|
| AATO > ₹5 Crore (any FY since 2017-18) | Mandatory |
| Below ₹5 Crore | Not required |

E-invoicing requires:
- Reporting invoice to IRP (Invoice Registration Portal)
- Receiving IRN (Invoice Reference Number) and digitally signed QR code
- Including IRN + QR on the printed invoice
- 30-day reporting window for turnover > ₹10 Cr

### Current Implementation

- ❌ **No E-Invoice model/fields** on Invoice
- ❌ **No IRP integration** for IRN generation
- ❌ **No QR code generation** on invoices
- ✅ GSTIN controller fetches `eInvoiceApplicable` status from GST portal (informational only)

> [!CAUTION]
> **For MSMEs with turnover > ₹5 Crore**, this is a critical gap. Invoices without valid IRN are treated as invalid, and buyers cannot claim ITC.

### Recommended Implementation

1. Add to Invoice model: `irnNumber`, `irnDate`, `acknowledgeNumber`, `qrCodeData`, `signedInvoice`, `eInvoiceStatus`
2. Integrate with NIC E-Invoice API
3. Auto-generate IRN when invoice is posted (status → Sent)
4. Embed QR code in PDF template

---

## 9. Credit Note & Debit Note

### Legal Requirements (Section 34 CGST Act)

| Field | Required | In Schema | Status |
|-------|:--------:|:---------:|:------:|
| Nature of document label | Yes | Implicit | ✅ |
| Supplier GSTIN | Yes | Via Organization | ✅ |
| Unique serial number | Yes | `creditNoteNumber` | ✅ |
| Date of issue | Yes | `creditNoteDate` | ✅ |
| Recipient GSTIN | Yes | Via `customerId` → Contact | ✅ |
| Original invoice reference | Yes | `referenceInvoiceId` | ✅ |
| Taxable value & tax | Yes | `subTotal`, `taxAmount` | ✅ |
| Reason | Yes | `reason` field | ✅ |

### Time Limit Compliance

- Credit Notes must be declared by **30th November** following the FY of original supply
- ❌ **No automated warning** when approaching this deadline
- ❌ **No validation** preventing creation beyond the deadline

### Vendor Credits (Purchase-side)

- ✅ `vendor-credit.model.ts` mirrors Credit Note with `referenceBillId`, `sourceOfSupply`, `destinationOfSupply`

**Verdict:** ✅ Credit Note structure is legally compliant. ⚠️ Missing deadline enforcement.

---

## 10. Inventory & Books of Accounts

### Legal Requirements (Section 35 / Rule 56 CGST Rules)

| Requirement | Implementation | Status |
|-------------|---------------|:------:|
| Opening balance tracking | ✅ `stockOnHand` on Item model | ✅ |
| Receipt tracking (goods in) | ✅ `purchase-receive.model.ts`, `putaway.model.ts` | ✅ |
| Supply tracking (goods out) | ✅ Via Invoice/DC stock deduction | ✅ |
| Loss/destruction logging | ✅ `inventory-adjustment.model.ts` with reasons | ✅ |
| Closing balance | ✅ Real-time `stockOnHand` | ✅ |
| Warehouse-wise tracking | ✅ `warehouse.model.ts`, `warehouseId` on items | ✅ |
| Committed stock | ✅ `committedStock` on Item | ✅ |
| Valuation method | ✅ `valuationMethod`: MovingAverage / FIFO | ✅ |
| Audit trail | ✅ `auditTrailPlugin` on all models | ✅ |
| Electronic records | ✅ MongoDB with timestamps | ✅ |
| 72-month retention | ⚠️ Soft-delete exists but no archival policy | ⚠️ |

### Stock Movement on Dispatch

The `sales-order.controller.ts` correctly handles stock:
- ✅ Committed stock increases on SO approval (`updateCommittedStock("commit")`)
- ✅ Stock decreases on shipment delivery (`transitionShipmentStatus` → Delivered)
- ✅ Inventory Adjustment records are created for each stock movement
- ✅ Prevents double-deduction when posted invoice already moved stock

**Verdict:** ✅ Inventory management is well-implemented and compliant with Rule 56.

---

## 11. GST Return Filing Readiness

### GSTR-1 (Outward Supplies)

| Data Point | Available | Source |
|-----------|:---------:|--------|
| B2B Invoice details | ✅ | Invoice model + Contact GSTIN |
| B2C Invoice details | ⚠️ | No B2B/B2C flag on invoices |
| HSN-wise summary | ✅ | `hsnSacCode` on line items |
| Credit/Debit notes | ✅ | Credit Note model |
| Place of Supply | ⚠️ | Missing on Invoice model |
| Tax rate-wise breakdown | ⚠️ | Single taxAmount, no CGST/SGST split |

### GSTR-3B (Summary Return)

| Data Point | Available | Source |
|-----------|:---------:|--------|
| Total taxable value | ✅ | Invoice `subTotal` |
| Total tax collected | ✅ | Invoice `taxAmount` |
| ITC claimed (purchase side) | ⚠️ | Bill model has tax fields but no ITC tracking |
| Inter/intra-state split | ⚠️ | Determinable from tax linkage but not persisted |

> [!WARNING]
> **GSTR-1 Export Readiness:** The software cannot currently generate a GSTR-1 compliant export because: (1) tax amounts aren't split into CGST/SGST/IGST, (2) Place of Supply is missing on invoices, (3) no B2B vs B2C classification exists.

---

## 12. Dual-Path Sales Order Architecture

### Path A: Direct Sale (SO → Invoice)

```
Sales Order (APPROVED) → "Convert to Invoice" → Tax Invoice (Draft)
                                                    ↓
                                              Stock deducted on posting
                                                    ↓
                                              Payment Received
```

**Implementation:** ✅ `convertToInvoice` in `sales-order.controller.ts`

### Path B: Deferred Sale (SO → DC → Invoice)

```
Sales Order (APPROVED) → "Convert to Delivery Challan" → DC (Open)
                                                           ↓
                                                    Stock deducted physically
                                                           ↓
                                                    DC marked "Delivered"
                                                           ↓
                                                    "Convert to Invoice"
                                                           ↓
                                                    Tax Invoice (Draft)
                                                           ↓
                                                    Payment Received
```

**Implementation:** ✅ Both paths functional. The `convertToInvoice` on DC controller correctly creates the invoice and updates linkage.

### Scenarios Where DC is Skipped

| Scenario | Supported |
|----------|:---------:|
| Direct sale with immediate invoicing | ✅ Path A |
| Over-the-counter / retail sales | ✅ Path A (create invoice directly) |
| Service-based transactions | ✅ Items support `itemType: "Service"` |
| Drop-shipping (Bill-To / Ship-To) | ⚠️ PO model has `deliveryAddressType` + `deliveryCustomerId`, but Invoice lacks Ship-To address |

---

## 13. Compliance Gap Summary

### 🔴 Critical Gaps (Legal Risk)

| # | Gap | Impact | Priority |
|---|-----|--------|:--------:|
| 1 | **No CGST/SGST/IGST split** on invoices | Invalid invoice format; buyer ITC denial risk | P0 |
| 2 | **No Place of Supply** on Invoice model | Section 31/Rule 46 non-compliance | P0 |
| 3 | **No E-Way Bill** integration | Goods detention risk for shipments > ₹50K | P0 |
| 4 | **No Reverse Charge** indicator on Invoice | Non-compliance for RCM transactions | P1 |

### 🟡 Important Gaps (Compliance Risk)

| # | Gap | Impact | Priority |
|---|-----|--------|:--------:|
| 5 | **No E-Invoicing** (IRN/QR) | Required for AATO > ₹5Cr; invalid invoices | P1 |
| 6 | **No GSTR-1 export** capability | Manual return filing required | P1 |
| 7 | **No Ship-To address** on Invoice | Bill-To/Ship-To scenarios incomplete | P2 |
| 8 | **No Unit of Measurement** on invoice lines | Rule 46 requires UQC | P2 |
| 9 | **No HSN digit validation** | Wrong HSN format on GSTR-1 | P2 |
| 10 | **No Credit Note deadline** warning | Risk of missed filing deadline | P2 |

### 🟢 What's Already Compliant

| Area | Status |
|------|:------:|
| O2C Workflow (PO → SO → DC → Invoice → Payment) | ✅ |
| Dual-path SO architecture (direct invoice vs DC route) | ✅ |
| Delivery Challan types (Rule 55) | ✅ |
| DC → Invoice conversion | ✅ |
| GSTIN validation (format + checksum + portal lookup) | ✅ |
| Inter/Intra-state tax selection logic | ✅ |
| TDS/TCS master with section codes | ✅ |
| Contact tax treatment categories | ✅ |
| HSN/SAC code fields on all documents | ✅ |
| Inventory tracking with committed stock | ✅ |
| Warehouse management | ✅ |
| Audit trail on all models | ✅ |
| Credit Notes with invoice reference | ✅ |
| Vendor Credits with bill reference | ✅ |
| GL entries for double-entry bookkeeping | ✅ |
| State code mapping (all 37 states + UTs) | ✅ |
| Fiscal year (April start) | ✅ |
| INR as base currency | ✅ |

---

## 14. Recommended Roadmap

### Phase 1: Critical Compliance (P0)

1. **Add `placeOfSupply` to Invoice model** — copy from SO or Contact during creation
2. **Split tax amounts** — add `cgstAmount`, `sgstAmount`, `igstAmount`, `cessAmount` to invoice line items (or derive at PDF/export time from the tax entity)
3. **Add `isReverseCharge`** boolean to Invoice model
4. **Add `unitOfMeasurement`** (UQC) to invoice line items
5. **E-Way Bill MVP** — model + threshold check + manual EWB number entry (API integration later)

### Phase 2: E-Invoicing & Returns (P1)

6. **E-Invoice integration** — IRN generation via NIC API, QR code on PDFs
7. **GSTR-1 data export** — generate JSON/CSV in GSTR-1 format from invoices
8. **GSTR-3B summary** — auto-compute tax liability summary
9. **Ship-To address** on Invoice for drop-ship scenarios

### Phase 3: Advanced Compliance (P2)

10. **HSN validation** — enforce digit count based on org turnover bracket
11. **Credit Note deadline alerts** — warn when approaching Nov 30 cutoff
12. **ITC tracking** — track Input Tax Credit on purchase-side
13. **72-month data retention policy** — implement archival strategy
14. **Composition Scheme support** — Bill of Supply instead of Tax Invoice

---

## Appendix A: Key Legal References

| Law / Rule | Subject | Relevance |
|-----------|---------|-----------|
| Section 31 CGST Act | Tax Invoice issuance | When and how to issue |
| Rule 46 CGST Rules | Invoice mandatory fields | 13 required fields |
| Rule 55 CGST Rules | Delivery Challan | Transport without invoice |
| Section 34 CGST Act | Credit / Debit Notes | Adjustments to invoices |
| Section 35 CGST Act | Books of Accounts | Record-keeping mandate |
| Rule 56 CGST Rules | Stock register details | Inventory compliance |
| Section 36 CGST Act | Record retention | 72 months minimum |
| Section 10 IGST Act | Place of Supply (Goods) | Interstate determination |
| Section 12 IGST Act | Place of Supply (Services) | Service location rules |
| Rule 48(4) CGST Rules | E-Invoicing | IRN/QR requirements |
| Section 68 + Rule 138 | E-Way Bill | Transport documentation |
| Section 194Q IT Act | TDS on Purchase | Buyer deducts 0.1% |
| Section 206C IT Act | TCS on Sale | Seller collects (omitted Apr 2025) |

## Appendix B: GST Tax Rate Slabs

| Rate | CGST | SGST | IGST | Common Items |
|:----:|:----:|:----:|:----:|-------------|
| 0% | 0% | 0% | 0% | Essential food, books |
| 5% | 2.5% | 2.5% | 5% | Packaged food, transport |
| 12% | 6% | 6% | 12% | Processed food, smartphones |
| 18% | 9% | 9% | 18% | Most goods & services |
| 28% | 14% | 14% | 28% | Luxury, sin goods |

## Appendix C: State Code Reference (GSTIN)

| Code | State | Code | State |
|:----:|-------|:----:|-------|
| 01 | Jammu & Kashmir | 20 | Jharkhand |
| 02 | Himachal Pradesh | 21 | Odisha |
| 03 | Punjab | 22 | Chhattisgarh |
| 04 | Chandigarh | 23 | Madhya Pradesh |
| 05 | Uttarakhand | 24 | Gujarat |
| 06 | Haryana | 27 | Maharashtra |
| 07 | Delhi | 29 | Karnataka |
| 08 | Rajasthan | 30 | Goa |
| 09 | Uttar Pradesh | 32 | Kerala |
| 10 | Bihar | 33 | Tamil Nadu |
| 11 | Sikkim | 34 | Puducherry |
| 18 | Assam | 36 | Telangana |
| 19 | West Bengal | 37 | Andhra Pradesh |
