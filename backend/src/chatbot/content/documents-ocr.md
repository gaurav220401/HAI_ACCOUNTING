---
title: Documents and Gemini OCR System
url: /docs/documents-ocr
---

# Documents and Gemini OCR System

HAI Accounting features an advanced, automated document ingestion and parsing engine that uses Gemini AI to perform Optical Character Recognition (OCR) and structured data extraction.

## Document Inbox
The Document Inbox acts as a central repository for raw financial documents before they are recorded in the accounting system:
- **Supported Uploads**: Drag-and-drop or select images (PNG, JPG, WEBP, GIF, BMP, TIFF), PDFs, Word files (DOCX), and Excel spreadsheets (XLSX, XLS, CSV).
- **Organization folders**: Create and organize custom document folders to categorize receipts, bills, contracts, or tax declarations.

## Centralized OCR Pipeline
Once a document is uploaded, it is automatically processed by the centralized Gemini-powered OCR pipeline (`ocr.service.ts`):
- **Model**: Powered by `gemini-2.0-flash` or `gemini-2.5-flash` for fast, cost-effective processing.
- **Multimodal Extraction**: For images and PDFs, the service transmits the file buffer directly as inline base64 data to Gemini, alongside system prompts tailored to identify specific financial attributes.
- **Document Type Detection**: The pipeline automatically classifies the uploaded file (e.g. Invoice, Expense Receipt, Bill, Bank Statement, Purchase Order, Credit Note, or Delivery Challan) and extracts:
  - Document Date and Document Number
  - Vendor / Customer Details (Name, Address, GSTIN)
  - Line Items (Descriptions, Quantities, Unit Rates, Tax Rates)
  - Total Amounts, Taxes, and Currency Code
  - Overall confidence score (0-1)
- **Non-image Files parsing**: Docx files are parsed via the `mammoth` library, and Excel files are parsed to CSV strings via `xlsx` before sending the raw text context to Gemini.
- **Record Creation**: Users can click on a parsed document to pre-fill creation forms (e.g. creating a Bill or Expense from a parsed receipt) in a single click, eliminating manual data entry.

## Automated Email Ingestion
To fully automate operations, you can configure the system to poll a dedicated inbound email mailbox:
- **IMAP Worker**: A background worker polls your SMTP/IMAP server inbox at configurable intervals (e.g., every 45 seconds).
- **Filtering**: Filters incoming emails based on configurations (e.g., only processing attachments from trusted senders, or extracting bank statements).
- **Attachment Extraction**: Downloads valid PDF or image attachments, saves them to the document database, and queues them for automatic Gemini OCR extraction.
- **Error Handling**: Implements retry policies and back-offs for connection issues, and logs processing details for administration auditing.
