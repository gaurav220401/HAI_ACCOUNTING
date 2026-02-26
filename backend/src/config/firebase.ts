import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const initFirebase = (): typeof admin => {
  if (admin.apps.length > 0) return admin;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const resolvedPath =
    serviceAccountPath ? path.resolve(serviceAccountPath) : null;

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    // Load from service account JSON file
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serviceAccount = require(resolvedPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Load from individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Firebase credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
          "and FIREBASE_PRIVATE_KEY in your .env file, or set FIREBASE_SERVICE_ACCOUNT_PATH " +
          "to the path of a valid service account JSON.",
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  console.log("Firebase Admin initialized");
  return admin;
};

initFirebase();

export default admin;
