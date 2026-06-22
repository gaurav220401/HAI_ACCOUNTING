import { apiFetchOcr } from "./client";

export interface OcrResultData {
  success: boolean;
  documentType: string;
  confidence: number;
  extractedData: Record<string, any>;
  rawText: string;
  processingTimeMs: number;
  model: string;
  error?: string;
}

export const ocrApi = {
  /**
   * Upload a document file (image/PDF/Excel/Word) to perform Gemini-powered OCR extraction.
   * Uses a direct fetch with long timeout to avoid Next.js proxy 30s limit.
   * @param file - the File object to upload
   * @param documentType - the category prompt to use (e.g. invoice, bill, expense, item, etc.)
   */
  async extract(file: File, documentType: string): Promise<{ success: boolean; data: OcrResultData }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);

    return apiFetchOcr<{ success: boolean; data: OcrResultData }>("/ocr/extract", {
      method: "POST",
      body: formData,
    });
  },
};
