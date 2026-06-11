import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function normalizePrivateKey(privateKey?: string): string | undefined {
  if (!privateKey) return undefined;
  // JSON.parse() already converts \n to actual newlines, no need to replace
  return privateKey;
}

function fromServiceAccountJsonRaw(raw: string): admin.ServiceAccount {
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  const projectId = parsed.project_id;
  const clientEmail = parsed.client_email;
  const privateKey = normalizePrivateKey(parsed.private_key);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Invalid FIREBASE_SERVICE_ACCOUNT_JSON payload. Expected project_id, client_email and private_key.",
    );
  }

  return { projectId, clientEmail, privateKey };
}

function getServiceAccountFromEnv(): admin.ServiceAccount | null {
  // Priority 1: Individual environment variables (RECOMMENDED for Vercel)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  // Priority 2: Base64 encoded JSON
  const jsonBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (jsonBase64) {
    try {
      const decoded = Buffer.from(jsonBase64, "base64").toString("utf8");
      return fromServiceAccountJsonRaw(decoded);
    } catch {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON_BASE64. Could not decode/parse JSON.");
    }
  }

  // Priority 3: Raw JSON string
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      return fromServiceAccountJsonRaw(jsonRaw);
    } catch {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON. Could not parse JSON.");
    }
  }

  return null;
}

const initFirebase = (): typeof admin => {
  if (admin.apps.length > 0) return admin;

  const fromEnv = getServiceAccountFromEnv();
  if (fromEnv) {
    admin.initializeApp({
      credential: admin.credential.cert(fromEnv),
    });
    console.log("Firebase Admin initialized (env credentials)");
    return admin;
  }

  let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    serviceAccountPath = serviceAccountPath.replace(/^['"]|['"]$/g, "");
  }
  const resolvedPath =
    serviceAccountPath ? path.resolve(serviceAccountPath) : null;

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    // Local/dev fallback: load from service account JSON file
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serviceAccount = require(resolvedPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized (file path credentials)");
  } else {
    throw new Error(
      "Firebase credentials missing. Use one of: FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, " +
        "FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID+FIREBASE_CLIENT_EMAIL+FIREBASE_PRIVATE_KEY, " +
        "or FIREBASE_SERVICE_ACCOUNT_PATH (local only).",
    );
  }
  return admin;
};

initFirebase();

export default admin;
