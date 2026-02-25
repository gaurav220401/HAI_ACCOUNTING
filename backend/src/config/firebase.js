const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const initFirebase = () => {
  if (admin.apps.length > 0) return admin;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const resolvedPath = serviceAccountPath
    ? path.resolve(serviceAccountPath)
    : null;

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    // Option 1: Load from service account JSON file
    const serviceAccount = require(resolvedPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Option 2: Load from individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Firebase credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
        'and FIREBASE_PRIVATE_KEY in your .env file, or set FIREBASE_SERVICE_ACCOUNT_PATH ' +
        'to the path of a valid service account JSON.'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  console.log('Firebase Admin initialized');
  return admin;
};

initFirebase();

module.exports = admin;
