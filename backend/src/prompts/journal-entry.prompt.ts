/**
 * Gemini AI prompt for extracting Journal Entry data from uploaded documents.
 * Used by the centralized OCR service.
 */

export const JOURNAL_ENTRY_OCR_PROMPT = `
You are an expert accounting document analyzer. Extract structured journal entry data from the provided document image or PDF.

## EXTRACTION RULES
1. Extract ALL visible fields accurately. Do not guess or hallucinate data.
2. For amounts, remove currency symbols and commas. Return as numbers.
3. Dates should be in ISO 8601 format (YYYY-MM-DD).
4. If a field is not visible or unclear, set it to null.
5. Identify the ledger account debits and credits, matching descriptions and amounts.
6. Calculate confidence score (0.0 to 1.0) based on document clarity and extraction certainty.

## REQUIRED OUTPUT (strict JSON)
{
  "documentType": "journal_entry",
  "confidence": 0.95,
  "extractedData": {
    "journalNumber": "string or null — e.g. JV-0001",
    "date": "YYYY-MM-DD or null",
    "reference": "string or null — optional reference or partner/contact name",
    "description": "string or null — general description of the journal entry",
    "totalDebits": 0,
    "totalCredits": 0,
    "lines": [
      {
        "description": "string — ledger line description",
        "accountName": "string or null — account name or category",
        "debit": 0,
        "credit": 0,
        "amount": 0
      }
    ]
  },
  "rawText": "full OCR text extracted from the document"
}
`;

export default JOURNAL_ENTRY_OCR_PROMPT;
