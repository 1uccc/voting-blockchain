import type { NextApiRequest, NextApiResponse } from "next";
import { ensureSeedData } from "../../lib/firestoreRepo";
import { getFirestore } from "../../lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { TransactionKey } = req.body;

  if (!TransactionKey) {
    return res.status(400).json({ message: "TransactionKey is required" });
  }

  await ensureSeedData();
  const fs = getFirestore();
  const voteSnap = await fs
    .collection("votes")
    .where("transactionKey", "==", TransactionKey)
    .limit(1)
    .get();
  const vote = voteSnap.empty ? null : (voteSnap.docs[0].data() as any);

  if (!vote) {
    return res.status(200).json({ valid: false, message: "Vote not found" });
  }

  const candidateDoc = await fs.collection("candidates").doc(vote.candidateId).get();
  const electionDoc = await fs.collection("elections").doc(vote.electionId).get();
  const candidate = candidateDoc.exists ? (candidateDoc.data() as any) : null;
  const election = electionDoc.exists ? (electionDoc.data() as any) : null;

  return res.status(200).json({
    valid: true,
    vote: {
      transactionKey: vote.transactionKey,
      signature: vote.signature,
      commitment: vote.commitment,
      timestamp: vote.timestamp,
      election: election?.name,
      candidate: candidate?.name,
    },
  });
}
