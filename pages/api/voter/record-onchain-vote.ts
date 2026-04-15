import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { getFirestore } from "../../../lib/firebaseAdmin";

type Ok = { message: string };
type Err = { message: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token) as { id?: string } | null;
  if (!decoded?.id) return res.status(401).json({ message: "Invalid token" });

  const { electionId, candidateId, txHash } = req.body || {};
  if (!electionId || !candidateId || !txHash) {
    return res.status(400).json({ message: "electionId, candidateId, txHash are required" });
  }

  const fs = getFirestore();
  const voterId = decoded.id;
  try {
    const existed = await fs
      .collection("votes")
      .where("voterId", "==", voterId)
      .where("electionId", "==", electionId)
      .limit(1)
      .get();
    if (!existed.empty) return res.status(409).json({ message: "Bạn đã bỏ phiếu ở cuộc bầu cử này." });

    const voteRef = fs.collection("votes").doc();
    await fs.runTransaction(async (tx) => {
      tx.set(voteRef, {
        id: voteRef.id,
        voterId,
        electionId,
        candidateId,
        transactionKey: txHash,
        signature: txHash,
        commitment: txHash,
        timestamp: new Date().toISOString(),
      });
      tx.set(
        fs.collection("voterElections").doc(`${voterId}_${electionId}`),
        { voterId, electionId, status: "complete", updatedAt: new Date().toISOString() },
        { merge: true }
      );
    });

    return res.status(200).json({ message: "Đã ghi nhận phiếu bầu." });
  } catch {
    return res.status(500).json({ message: "Không thể ghi nhận phiếu bầu." });
  }
}
