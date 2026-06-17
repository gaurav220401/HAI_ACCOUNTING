/**
 * Centralized prompt registry for the OCR system.
 * Each section has its own prompt file for maintainability.
 */

export { INVOICE_OCR_PROMPT } from "./invoice.prompt";
export { BILL_OCR_PROMPT } from "./bill.prompt";
export { EXPENSE_OCR_PROMPT } from "./expense.prompt";
export { PURCHASE_ORDER_OCR_PROMPT } from "./purchase-order.prompt";
export { CREDIT_NOTE_OCR_PROMPT } from "./credit-note.prompt";
export { QUOTE_OCR_PROMPT } from "./quote.prompt";
export { DELIVERY_CHALLAN_OCR_PROMPT } from "./delivery-challan.prompt";
export { BANK_STATEMENT_OCR_PROMPT } from "./bank-statement.prompt";

/**
 * Supported OCR document types mapped to their prompts.
 */
export type OcrDocumentType =
  | "invoice"
  | "bill"
  | "expense"
  | "purchase_order"
  | "credit_note"
  | "quote"
  | "delivery_challan"
  | "bank_statement"
  | "auto";

import { INVOICE_OCR_PROMPT as invoice } from "./invoice.prompt";
import { BILL_OCR_PROMPT as bill } from "./bill.prompt";
import { EXPENSE_OCR_PROMPT as expense } from "./expense.prompt";
import { PURCHASE_ORDER_OCR_PROMPT as purchaseOrder } from "./purchase-order.prompt";
import { CREDIT_NOTE_OCR_PROMPT as creditNote } from "./credit-note.prompt";
import { QUOTE_OCR_PROMPT as quote } from "./quote.prompt";
import { DELIVERY_CHALLAN_OCR_PROMPT as deliveryChallan } from "./delivery-challan.prompt";
import { BANK_STATEMENT_OCR_PROMPT as bankStatement } from "./bank-statement.prompt";

export const OCR_PROMPTS: Record<string, string> = {
  invoice,
  bill,
  expense,
  purchase_order: purchaseOrder,
  credit_note: creditNote,
  quote,
  delivery_challan: deliveryChallan,
  bank_statement: bankStatement,
};

/**
 * Auto-detection prompt used when documentType is "auto".
 * Gemini first classifies the document, then extracts accordingly.
 */
export const AUTO_DETECT_PROMPT = `
You are an expert accounting document analyzer. First, classify the document type, then extract structured data.

## STEP 1: CLASSIFY
Determine the document type from: invoice, bill, expense, purchase_order, credit_note, quote, delivery_challan, bank_statement.

Classification hints:
- "Invoice", "Tax Invoice", "GST Invoice" → invoice (sales document)
- "Bill", "Purchase Invoice", "Vendor Invoice" → bill (purchase document)
- "Receipt", "Cash Memo", "Expense Voucher" → expense
- "Purchase Order", "PO" → purchase_order
- "Credit Note", "Credit Memo" → credit_note
- "Quotation", "Estimate", "Proforma" → quote
- "Delivery Challan", "Delivery Note", "DC" → delivery_challan
- "Bank Statement", "Account Statement" → bank_statement

## STEP 2: EXTRACT
Based on the classified type, extract ALL relevant fields.

## OUTPUT (strict JSON)
{
  "detectedType": "one of the types above",
  "confidence": 0.95,
  "documentType": "same as detectedType",
  "extractedData": { ... fields relevant to the detected type ... },
  "rawText": "full OCR text"
}
`;
