import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { ensureSeedData } from "../../../lib/firestoreRepo";
import { getFirestore } from "../../../lib/firebaseAdmin";

type Res =
  | { elections: any[]; candidates: any[] }
  | { message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Res>
) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await ensureSeedData();
    const fs = getFirestore();

    const electionsSnap = await fs.collection("elections").get();
    const candidatesSnap = await fs.collection("candidates").get();

    return res.status(200).json({
      elections: electionsSnap.docs.map((d) => d.data()),
      candidates: candidatesSnap.docs.map((d) => d.data()),
    });
  } catch (e) {
    console.error("Admin overview error:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
}

