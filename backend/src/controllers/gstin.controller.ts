import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { ValidationError } from "../utils/errors";

// ─── Constants ───────────────────────────────────────────────────────────────

const GSTIN_REGEX =
  /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[1-9A-Za-z]{1}[Zz1-9A-Ja-j]{1}[0-9A-Za-z]{1}$/;

const GST_CAPTCHA_URL = "https://services.gst.gov.in/services/captcha?rnd=";
const GST_DETAILS_URL = "https://services.gst.gov.in/services/api/search/taxpayerDetails";
const CAPTCHA_COOKIE_NAME = "CaptchaCookie";
const INVALID_GST_CODE = "SWEB_9035";
const INVALID_CAPTCHA_CODE = "SWEB_9000";

const STATE_CODE_MAP: Record<string, string> = {
  "01": "Jammu and Kashmir",    "02": "Himachal Pradesh",
  "03": "Punjab",               "04": "Chandigarh",
  "05": "Uttarakhand",          "06": "Haryana",
  "07": "Delhi",                "08": "Rajasthan",
  "09": "Uttar Pradesh",        "10": "Bihar",
  "11": "Sikkim",               "12": "Arunachal Pradesh",
  "13": "Nagaland",             "14": "Manipur",
  "15": "Mizoram",              "16": "Tripura",
  "17": "Meghalaya",            "18": "Assam",
  "19": "West Bengal",          "20": "Jharkhand",
  "21": "Odisha",               "22": "Chhattisgarh",
  "23": "Madhya Pradesh",       "24": "Gujarat",
  "25": "Daman and Diu",        "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",          "28": "Andhra Pradesh",
  "29": "Karnataka",            "30": "Goa",
  "31": "Lakshadweep",          "32": "Kerala",
  "33": "Tamil Nadu",           "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh",       "38": "Ladakh",
  "97": "Other Territory",      "99": "Centre Jurisdiction",
};

// ─── Checksum Validation ──────────────────────────────────────────────────────

function validGstCheckSum(gstin: string): boolean {
  const upper = gstin.trim().toUpperCase();
  const gstSubstring = upper.substring(0, 14);
  const cpChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const mod = cpChars.length;
  let factor = 2, sum = 0;
  for (let i = gstSubstring.length - 1; i >= 0; i--) {
    const codePoint = cpChars.indexOf(gstSubstring[i]);
    if (codePoint < 0) return false;
    let digit = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    digit = Math.floor(digit / mod) + (digit % mod);
    sum += digit;
  }
  const checkCodePoint = (mod - (sum % mod)) % mod;
  return (gstSubstring + cpChars[checkCodePoint]) === upper;
}

function isValidGstin(gstin: string): boolean {
  const upper = gstin.trim().toUpperCase();
  return GSTIN_REGEX.test(upper) && validGstCheckSum(upper);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseGstinLocally(gstin: string) {
  const stateCode = gstin.substring(0, 2);
  return { gstin, pan: gstin.substring(2, 12), stateCode, state: STATE_CODE_MAP[stateCode] ?? "" };
}

function extractCaptchaCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  const cookies = cookieHeader.split(/,(?=[A-Za-z])/);
  for (const cookie of cookies) {
    const parts = cookie.split(";");
    for (const part of parts) {
      const [key, ...rest] = part.trim().split("=");
      if (key === CAPTCHA_COOKIE_NAME && rest.length) return rest.join("=");
    }
  }
  return "";
}

function normaliseGovResponse(raw: any, gstin: string) {
  const local = parseGstinLocally(gstin);
  const pradr = raw.pradr?.addr ?? {};

  /**
   * GST portal address fields:
   *  bnm  = building name          bno  = building number
   *  flno = floor number           st   = street name
   *  loc  = locality / area        dst  = district
   *  stcd = state name (full)      pncd = pincode
   */
  // Improved address parsing: if pradr.adr exists, parse it for best mapping
  function parseAddressString(addrStr: string) {
    // Example: "4/B, Cross Street 3, Bhilai Nagar Police Station, Sector 6, Bhilai, Durg, Chhattisgarh, 490006"
    const parts = addrStr ? addrStr.split(",").map(s => s.trim()) : [];
    // Heuristic: last part is zip, second last is state, third last is city/district
    const zip = parts.length > 0 ? parts[parts.length - 1] : "";
    const state = parts.length > 1 ? parts[parts.length - 2] : "";
    const city = parts.length > 2 ? parts[parts.length - 3] : "";
    // Street1: first 2 parts, Street2: next 2 parts, rest is attention
    const street = parts.slice(0, 2).join(", ");
    const street2 = parts.slice(2, 4).join(", ");
    return { street, street2, city, state, zip, country: "India" };
  }

  // Use GST portal structured fields if present, else parse pradr.adr string
  function buildAddress(addr: any, addrStr?: string) {
    if (addr && (addr.bnm || addr.bno || addr.flno || addr.st || addr.loc)) {
      return {
        street: [addr.bnm, addr.bno, addr.flno].filter(Boolean).join(", "),
        street2: [addr.st, addr.loc].filter(Boolean).join(", "),
        city: addr.dst || addr.loc || "",
        state: addr.stcd || "",
        zip: addr.pncd || "",
        country: "India",
      };
    } else if (addrStr) {
      return parseAddressString(addrStr);
    } else {
      return { street: "", street2: "", city: "", state: "", zip: "", country: "India" };
    }
  }

  const primaryAddress = buildAddress(pradr, raw.pradr?.adr);

  return {
    gstin: (raw.gstin ?? gstin).toUpperCase(),
    // trade name (preferred) vs legal name
    companyName: raw.tradeNam || raw.lgnm || "",
    legalName: raw.lgnm || "",
    taxpayerType: raw.dty || "",
    gstinStatus: raw.sts || "",
    registrationDate: raw.rgdt || "",
    cancellationDate: raw.cxdt || "",
    pan: local.pan,
    stateCode: local.stateCode,
    // Use state from address if available; else derive from GSTIN code
    state: pradr.stcd || local.state,
    addressType: raw.pradr?.ntr || "Principal Place of Business",
    // Full joined address string as returned by the portal for display
    addressString: raw.pradr?.adr || "",
    // Structured address for form filling
    address: {
      attention: raw.lgnm || "",   // use legal name as attention
      ...primaryAddress,
    },
    additionalAddresses: (raw.adadr ?? []).map((a: any) => ({
      type: a.ntr || "",
      addressString: a.adr || "",
      ...buildAddress(a.addr ?? {}, a.adr),
      attention: raw.lgnm || "",
    })),
    naturalBusinessActivities: (raw.nba ?? []) as string[],
    companyType: raw.ctb || "",
    eInvoiceApplicable: raw.einvoiceStatus || "No",
  };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/gstin/captcha
 * Fetches a fresh CAPTCHA image from the GST portal.
 * Returns: { captchaImage: "data:image/png;base64,...", captchaCookie: "..." }
 */
export const getCaptcha = asyncHandler(async (_req: Request, res: Response) => {
  const url = `${GST_CAPTCHA_URL}${Math.random()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Referer": "https://services.gst.gov.in/",
        "Origin":  "https://services.gst.gov.in",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`GST captcha server responded ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/png";
    const rawSetCookie = response.headers.get("set-cookie") ?? "";
    const captchaCookie = extractCaptchaCookie(rawSetCookie);
    return res.json({
      success: true,
      data: { captchaImage: `data:${mimeType};base64,${base64}`, captchaCookie },
    });
  } catch (err: any) {
    clearTimeout(timer);
    console.error("[GSTIN captcha] fetch failed:", err?.message);
    return res.status(502).json({ success: false, message: "Could not reach GST portal. Please try again." });
  }
});

/**
 * POST /api/gstin/lookup
 * Body: { gstin, captcha, captchaCookie }
 */
export const lookupGstin = asyncHandler(async (req: Request, res: Response) => {
  const { gstin: rawGstin, captcha, captchaCookie } = req.body as {
    gstin?: string; captcha?: string; captchaCookie?: string;
  };
  const gstin = (rawGstin ?? "").trim().toUpperCase();
  if (!gstin) throw new ValidationError("gstin is required");
  if (!GSTIN_REGEX.test(gstin)) throw new ValidationError("Invalid GSTIN format.");
  if (!validGstCheckSum(gstin)) throw new ValidationError("Invalid GSTIN — checksum digit does not match.");

  if (captcha && captchaCookie) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const gstResponse = await fetch(GST_DETAILS_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Cookie": `${CAPTCHA_COOKIE_NAME}=${captchaCookie}`,
          "Referer": "https://services.gst.gov.in/",
          "Origin":  "https://services.gst.gov.in",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({ gstin, captcha }),
      });
      clearTimeout(timer);
      const raw: any = await gstResponse.json();

      if (raw?.errorCode === INVALID_CAPTCHA_CODE || raw?.message === "Invalid Captcha") {
        return res.status(400).json({ success: false, errorCode: "INVALID_CAPTCHA", message: "The captcha you entered is incorrect. Please refresh and try again." });
      }
      if (raw?.errorCode === INVALID_GST_CODE || raw?.message === "Invalid GSTIN") {
        return res.status(400).json({ success: false, errorCode: "INVALID_GSTIN", message: "GSTIN not found in the GST portal." });
      }
      if (raw?.lgnm || raw?.tradeNam) {
          // Show full GST portal response in backend console
          console.log("[GSTIN] Full portal response:", JSON.stringify(raw, null, 2));
          return res.json({ success: true, source: "gst-portal", data: normaliseGovResponse(raw, gstin) });
      }
      console.warn("[GSTIN] Unexpected portal response:", JSON.stringify(raw).slice(0, 200));
    } catch (apiErr: any) {
      console.warn("[GSTIN] Portal call failed:", apiErr?.message ?? apiErr);
    }
  }

  // Fallback: extract what we can from the GSTIN string itself
  const local = parseGstinLocally(gstin);
  return res.json({
    success: true,
    source: "local-parse",
    data: {
      gstin,
      companyName: "",
      legalName: "",
      taxpayerType: "",
      gstinStatus: "",
      registrationDate: "",
      cancellationDate: "",
      pan: local.pan,
      stateCode: local.stateCode,
      state: local.state,
      addressType: "",
      addressString: "",
      address: {
        attention: "",
        street: "",
        street2: "",
        city: "",
        state: local.state,
        zip: "",
        country: "India",
      },
      additionalAddresses: [],
      naturalBusinessActivities: [],
      companyType: "",
      eInvoiceApplicable: "",
    },
  });
});
