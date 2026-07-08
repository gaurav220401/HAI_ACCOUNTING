---
title: Sales and Receivables Module
url: /docs/sales-module
---

# Sales and Receivables Module

The Sales Module manages customer relationships, estimates, confirmed orders, billing, and cash collection.

## Customer Management
A customer record acts as the primary entity for all sales transactions:
- **Details**: Name, Company, Email, Phone, Currency, Billing Address, and Shipping Address.
- **Tax Details**: Tax preference (Taxable or Tax-Exempt), GST Treatment (e.g., Registered Business, Consumer, SEZ), and GSTIN.
- **Credit Terms**: Payment terms (e.g., Net 15, Net 30, Due on Receipt).

## Quotes (Estimates)
Quotes are formal offers sent to customers detailing items and pricing.
- **Lifecycle**: Draft -> Sent -> Accepted/Declined -> Invoiced (or Expired).
- **Template Customization**: Users can configure templates, adjust logo sizes, colors, and layout, and preview the resulting PDF in real-time in the editor before downloading or emailing the quote directly to the customer.

## Sales Orders
A Sales Order (SO) represents a confirmed purchase order from a customer. It is an internal document used to manage inventory allocation and fulfillment.
- **Statuses**: Draft, Open, Closed (fully fulfilled/invoiced), and Canceled.
- **Flow**: Can be created directly or converted from an accepted Quote. A Sales Order can then be converted into a Delivery Challan or Invoice.

## Invoices
Invoices are legal demands for payment sent to customers.
- **Components**: Invoice Number, Date, Due Date, Items, Unit Rates, Discounts, and Taxes.
- **Tax Invoicing**: Automatically calculates CGST/SGST (for intra-state sales) or IGST (for inter-state sales) based on the customer's shipping address state and the item's tax rate.
- **Statuses**: Draft, Sent, Paid, Partially Paid, Overdue, and Void.
- **Actions**: Email to customer, print/download PDF, record payment, and generate credit note.

## Recurring Invoices
For subscription-based or repeating billing:
- **Configuration**: Set the interval (weekly, monthly, yearly, or custom months/days), start date, end date, and payment terms.
- **Automation**: The backend running scheduler automatically triggers invoice generation on the scheduled date, sends it via email (if configured), and updates the ledger.

## Payments Received
Recording cash inflow from customers:
- **Methods**: Cash, Bank Transfer, Cheque, Credit Card, or online gateway.
- **Application**: A single payment can be applied fully or partially across one or more outstanding customer invoices.
- **Accounting**: Debits the Bank/Cash account and credits Accounts Receivable.

## Credit Notes
A Credit Note is issued to a customer for sales returns, pricing adjustments, or writing off bad debt.
- **Application**: Can be applied to reduce the balance of an open invoice for the same customer, or recorded as a cash refund (reducing the Bank/Cash balance).

## Delivery Challans
Used when dispatching goods from a warehouse:
- **Details**: Origin warehouse, shipping address, delivery date, transport mode, vehicle number, and line items.
- **Use Cases**: Trade shows, moving stock to third-party processors, or standard customer fulfillment before invoicing.

## Retainer Invoices
Retainer Invoices are used to bill customers in advance for services or projects:
- **Advance Tracking**: Payments received against a retainer invoice are held in a liability account (Customer Advances).
- **Application**: The accumulated retainer balance can be applied to reduce the total due on subsequent standard invoices.
