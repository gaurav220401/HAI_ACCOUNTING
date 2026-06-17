/**
 * Gemini AI prompt for extracting Bill (Purchase Invoice) data from uploaded documents.
 * Used by the centralized OCR service.
 */

export const BILL_OCR_PROMPT = `
You are an expert accounting document analyzer. Extract structured bill/purchase invoice data from the provided document image or PDF.

## EXTRACTION RULES
1. Extract ALL visible fields accurately. Do not guess or hallucinate data.
2. For amounts, remove currency symbols and commas. Return as numbers.
3. Dates should be in ISO 8601 format (YYYY-MM-DD).
4. If a field is not visible or unclear, set it to null.
5. For line items, extract every row from the items/products table.
6. A "bill" is a purchase invoice — the document YOU receive from a vendor/supplier.
7. Calculate confidence score (0.0 to 1.0) based on document clarity and extraction certainty.

## REQUIRED OUTPUT (strict JSON)
{
  "documentType": "bill",
  "confidence": 0.95,
  "extractedData": {
    "billNumber": "string or null — the vendor's invoice/bill number",
    "referenceNumber": "string or null",
    "orderNumber": "string or null — linked purchase order number",
    "billDate": "YYYY-MM-DD or null",
    "dueDate": "YYYY-MM-DD or null",
    "vendorName": "string or null",
    "vendorEmail": "string or null",
    "vendorPhone": "string or null",
    "vendorGSTIN": "string or null",
    "vendorPAN": "string or null",
    "vendorAddress": {
      "street": "string or null",
      "city": "string or null",
      "state": "string or null",
      "zip": "string or null",
      "country": "string or null"
    },
    "buyerName": "string or null — your company name as the buyer",
    "buyerGSTIN": "string or null",
    "buyerAddress": {
      "street": "string or null",
      "city": "string or null",
      "state": "string or null",
      "zip": "string or null",
      "country": "string or null"
    },
    "placeOfSupply": "string or null",
    "lineItems": [
      {
        "name": "string",
        "description": "string or null",
        "hsnSacCode": "string or null",
        "quantity": 0,
        "unit": "string or null",
        "rate": 0,
        "discountPercent": 0,
        "discountAmount": 0,
        "taxRate": 0,
        "taxName": "string or null",
        "taxAmount": 0,
        "amount": 0,
        "accountName": "string or null — expense account category if mentioned"
      }
    ],
    "subTotal": 0,
    "discountLevel": "transaction or line_item or null",
    "discountPercent": 0,
    "taxBreakdown": [
      {
        "taxName": "string (e.g. CGST, SGST, IGST)",
        "rate": 0,
        "amount": 0
      }
    ],
    "tdsApplicable": false,
    "tdsSection": "string or null — e.g. 194C, 194J",
    "tdsRate": 0,
    "tdsAmount": 0,
    "totalTaxAmount": 0,
    "adjustmentLabel": "string or null",
    "adjustmentAmount": 0,
    "total": 0,
    "amountInWords": "string or null",
    "paymentTerms": "string or null",
    "bankDetails": {
      "bankName": "string or null",
      "accountNumber": "string or null",
      "ifscCode": "string or null",
      "branchName": "string or null",
      "upiId": "string or null"
    },
    "notes": "string or null"
  },
  "rawText": "full OCR text extracted from the document"
}
`;

export default BILL_OCR_PROMPT;
