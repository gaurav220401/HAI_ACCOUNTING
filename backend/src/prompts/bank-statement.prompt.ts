/**
 * Gemini AI prompt for extracting Bank Statement data from uploaded documents.
 */

export const BANK_STATEMENT_OCR_PROMPT = `
You are an expert accounting document analyzer. Extract structured bank statement data from the provided document.

## RULES
1. Extract ALL visible fields accurately. Do not hallucinate.
2. Remove currency symbols/commas from amounts. Return numbers.
3. Dates in ISO 8601 (YYYY-MM-DD). Null if unclear.
4. Extract EVERY transaction row. Debit = money OUT, Credit = money IN.

## OUTPUT (strict JSON)
{
  "documentType": "bank_statement",
  "confidence": 0.95,
  "extractedData": {
    "bankName": "string or null",
    "branchName": "string or null",
    "accountNumber": "string or null",
    "accountHolderName": "string or null",
    "ifscCode": "string or null",
    "statementPeriod": { "from": "YYYY-MM-DD or null", "to": "YYYY-MM-DD or null" },
    "openingBalance": 0,
    "closingBalance": 0,
    "currency": "INR",
    "transactions": [
      {
        "date": "YYYY-MM-DD",
        "valueDate": "YYYY-MM-DD or null",
        "description": "string",
        "referenceNumber": "string or null",
        "debit": 0, "credit": 0, "balance": 0,
        "transactionType": "string or null"
      }
    ],
    "totalDebits": 0, "totalCredits": 0, "transactionCount": 0
  },
  "rawText": "full OCR text"
}
`;

export default BANK_STATEMENT_OCR_PROMPT;
