/**
 * Gemini AI prompt for extracting Sales Order data from uploaded documents.
 * Used by the centralized OCR service.
 */

export const SALES_ORDER_OCR_PROMPT = `
You are an expert accounting document analyzer. Extract structured sales order data from the provided document image or PDF.

## EXTRACTION RULES
1. Extract ALL visible fields accurately. Do not guess or hallucinate data.
2. For amounts, remove currency symbols and commas. Return as numbers.
3. Dates should be in ISO 8601 format (YYYY-MM-DD).
4. If a field is not visible or unclear, set it to null.
5. For line items, extract every row from the items/products table.
6. Calculate confidence score (0.0 to 1.0) based on document clarity and extraction certainty.

## REQUIRED OUTPUT (strict JSON)
{
  "documentType": "sales_order",
  "confidence": 0.95,
  "extractedData": {
    "salesOrderNumber": "string or null — e.g. SO-0001",
    "referenceNumber": "string or null",
    "orderDate": "YYYY-MM-DD or null",
    "customerName": "string or null",
    "customerGSTIN": "string or null",
    "placeOfSupply": "string or null",
    "items": [
      {
        "name": "string",
        "description": "string or null",
        "hsnSacCode": "string or null",
        "quantity": 0,
        "unit": "string or null",
        "rate": 0,
        "discountPercent": 0,
        "taxPercent": 0,
        "taxAmount": 0,
        "amount": 0
      }
    ],
    "subTotal": 0,
    "totalTaxAmount": 0,
    "total": 0,
    "notes": "string or null"
  },
  "rawText": "full OCR text extracted from the document"
}
`;

export default SALES_ORDER_OCR_PROMPT;
