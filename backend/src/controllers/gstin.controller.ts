import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { ValidationError } from "../utils/errors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Full 15-character GSTIN regex validation */
const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Maps GST state code (first 2 digits) → Indian state name
const STATE_CODE_MAP: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

/** Extract what we can directly from a GSTIN string */
function parseGstinLocally(gstin: string) {
  const stateCode = gstin.substring(0, 2);
  const pan = gstin.substring(2, 12);
  return {
    gstin,
    pan,
    stateCode,
    state: STATE_CODE_MAP[stateCode] ?? "",
  };
}

/** Try the free GST Govt search API */
async function fetchFromGovApi(gstin: string) {
  const url = `https://api.gst.gov.in/apiservice/search?action=TP&username=Guest&authtoken=undefined&gstin=${gstin}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.gst.gov.in/",
        "Origin": "https://www.gst.gov.in",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Normalise the raw Govt API response into a clean structure */
function normaliseGovResponse(raw: any, gstin: string) {
  const local = parseGstinLocally(gstin);

  // Primary address from the Govt API
  const pradr = raw.pradr?.addr;

  return {
    gstin: raw.gstin ?? gstin,
    companyName: raw.tradeNam ?? raw.lgnm ?? "",
    taxpayerType: raw.dty ?? "",
    gstinStatus: raw.sts ?? "",
    pan: local.pan,
    stateCode: local.stateCode,
    state: pradr?.stcd ?? local.state,
    addressType: raw.pradr?.ntr ?? "",
    address: {
      street: [pradr?.bnm, pradr?.bno, pradr?.flno, pradr?.st].filter(Boolean).join(", "),
      city: pradr?.loc ?? pradr?.dst ?? "",
      state: pradr?.stcd ?? local.state,
      zip: pradr?.pncd ?? "",
      country: "India",
    },
    additionalAddresses: (raw.adadr ?? []).map((a: any) => ({
      type: a.ntr ?? "",
      street: [a.addr?.bnm, a.addr?.bno, a.addr?.flno, a.addr?.st].filter(Boolean).join(", "),
      city: a.addr?.loc ?? a.addr?.dst ?? "",
      state: a.addr?.stcd ?? "",
      zip: a.addr?.pncd ?? "",
    })),
    eInvoiceApplicable: raw.einvoiceStatus ?? "No",
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /api/gstin/:gstin
 * Validates the GSTIN and tries to fetch business details from the GST portal.
 */
export const lookupGstin = asyncHandler(async (req: Request, res: Response) => {
  const { gstin } = req.params;
  const normalized = (Array.isArray(gstin) ? gstin[0] : gstin ?? "").trim().toUpperCase();

  if (!GSTIN_REGEX.test(normalized)) {
    throw new ValidationError("Invalid GSTIN format. Must be 15 characters: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric.");
  }

  try {
    const raw: any = await fetchFromGovApi(normalized);

    if (raw && (raw.tradeNam || raw.lgnm)) {
      return res.json({
        success: true,
        source: "gst-portal",
        data: normaliseGovResponse(raw, normalized),
      });
    }
  } catch (apiErr: any) {
    // Govt API unavailable / blocked — fall through to local parse
    console.warn("[GSTIN] Govt API failed:", apiErr?.message ?? apiErr);
  }

  // Fallback: return what we can from the GSTIN itself
  const local = parseGstinLocally(normalized);
  return res.json({
    success: true,
    source: "local-parse",
    data: {
      gstin: normalized,
      companyName: "",
      taxpayerType: "",
      gstinStatus: "",
      pan: local.pan,
      stateCode: local.stateCode,
      state: local.state,
      address: {
        street: "",
        city: "",
        state: local.state,
        zip: "",
        country: "India",
      },
      additionalAddresses: [],
      eInvoiceApplicable: "",
    },
  });
});
