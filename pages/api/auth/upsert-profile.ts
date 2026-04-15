import type { NextApiRequest, NextApiResponse } from "next";
import admin from "firebase-admin";
import { getFirestore } from "../../../lib/firebaseAdmin";
import { ensureSeedData } from "../../../lib/firestoreRepo";

type Body = {
  idToken: string;
  name?: string;
  locationId?: string;
};

type Res = { ok: true } | { message: string };

function requireAdminInitialized() {
  getFirestore();
  return admin.auth();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Res>
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const { idToken, name, locationId } = req.body as Body;
    if (!idToken) return res.status(400).json({ message: "idToken is required" });

    const auth = requireAdminInitialized();
    const decoded = await auth.verifyIdToken(idToken);
    const emailLower = (decoded.email || "").toLowerCase();
    if (!emailLower) return res.status(400).json({ message: "No email in token" });

    await ensureSeedData();
    const fs = getFirestore();
    const ref = fs.collection("voters").doc(decoded.uid);
    const now = new Date().toISOString();

    await fs.runTransaction(async (tx) => {
      const elections = await tx.get(fs.collection("elections"));
      const existing = await tx.get(ref);
      tx.set(
        ref,
        {
          id: decoded.uid,
          name: name || decoded.name || "User",
          email: decoded.email,
          emailLower,
          locationId: locationId || "dept-cs",
          createdAt: existing.exists ? (existing.data() as any)?.createdAt ?? now : now,
          updatedAt: now,
        },
        { merge: true }
      );

      // Ensure voterElections exist for all elections.
      elections.docs.forEach((eDoc) => {
        const electionId = eDoc.id;
        const veRef = fs.collection("voterElections").doc(`${decoded.uid}_${electionId}`);
        tx.set(
          veRef,
          {
            voterId: decoded.uid,
            electionId,
            status: "incomplete",
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      });
    });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("upsert-profile error:", e);
    return res.status(500).json({ message: e?.message || "Internal server error" });
  }
}

