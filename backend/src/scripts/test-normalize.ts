const STATE_BY_ALPHA_CODE: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AD: "Andhra Pradesh",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CG: "Chhattisgarh",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DD: "Daman and Diu",
  DL: "Delhi",
  FC: "Foreign Country",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha",
  OT: "Other Territory",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TS: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UK: "Uttarakhand",
  UA: "Uttarakhand",
  WB: "West Bengal",
};

const STATE_BY_GST_CODE: Record<string, string> = {
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
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
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
  "99": "Foreign Country",
};

function normalizeStateKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeState(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";

  const bracketCode = raw.match(/^\[([A-Za-z]{2})\]/)?.[1];
  const directAlphaCode = /^[A-Za-z]{2}$/.test(raw) ? raw : "";
  const alphaCode = (bracketCode || directAlphaCode || "").toUpperCase();
  if (alphaCode && STATE_BY_ALPHA_CODE[alphaCode]) {
    return normalizeStateKey(STATE_BY_ALPHA_CODE[alphaCode]);
  }

  const numericCode =
    raw.match(/\((\d{2})\)/)?.[1] ||
    (/^\d{2}$/.test(raw) ? raw : "");
  if (numericCode && STATE_BY_GST_CODE[numericCode]) {
    return normalizeStateKey(STATE_BY_GST_CODE[numericCode]);
  }

  return normalizeStateKey(
    raw
      .replace(/^\[[A-Za-z]{2}\]\s*-\s*/, "")
      .replace(/\(\d{2}\)/g, ""),
  );
}

console.log("MH ->", normalizeState("MH"));
console.log("Maharashtra ->", normalizeState("Maharashtra"));
console.log("Empty ->", normalizeState(""));
console.log("Undefined ->", normalizeState(undefined));
console.log("Null ->", normalizeState(null));
console.log("[MH] - Maharashtra ->", normalizeState("[MH] - Maharashtra"));
console.log("Maharashtra (27) ->", normalizeState("Maharashtra (27)"));
