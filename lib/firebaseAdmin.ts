import admin from "firebase-admin";
import fs from "fs";

function getServiceAccount(): admin.ServiceAccount {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    const rawFromFile = fs.readFileSync(path, "utf8");
    return JSON.parse(rawFromFile);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH env var."
    );
  }
  // Allow storing JSON in .env with escaped newlines.
  const normalized = raw.replace(/\\n/g, "\n");
  return JSON.parse(normalized);
}

export function getFirestore() {
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  return admin.firestore();
}

