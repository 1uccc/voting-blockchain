import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { verifyToken } from "../../../lib/auth";
import {
  generateTransactionKey,
  generateSignature,
} from "../../../lib/crypto";
import { ensureSeedData } from "../../../lib/firestoreRepo";
import { getFirestore } from "../../../lib/firebaseAdmin";

type ApiResponse =
  | {
      message: string;
    }
  | {
      message: string;
      transactionKey: string;
      signature: string;
    };

type DecodedToken = {
  id: string;
  [key: string]: unknown;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    /**
     * Step 1: Allow only POST requests.
     * Any other HTTP method should be rejected.
     */
    if (req.method !== "POST") {
      return res.status(405).json({
        message: "Method not allowed. Only POST requests are supported.",
      });
    }

    /**
     * Step 2: Extract and validate the Authorization header.
     * Expected format:
     * Authorization: Bearer <token>
     */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized. Bearer token is required.",
      });
    }

    const token = authHeader.split(" ")[1];

    /**
     * Step 3: Verify JWT or access token.
     * If token is invalid or expired, deny access.
     */
    const decoded = verifyToken(token) as DecodedToken | null;

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        message: "Invalid or expired token.",
      });
    }

    /**
     * Step 4: Read and validate request body.
     * Required fields:
     * - electionId
     * - candidateId
     */
    const { electionId, candidateId } = req.body;

    if (!electionId || !candidateId) {
      return res.status(400).json({
        message: "Both electionId and candidateId are required.",
      });
    }

    const voterId = decoded.id;

    await ensureSeedData();
    const fs = getFirestore();

    /**
     * Step 5: Ensure the voter has not already voted in this election.
     * One voter can cast only one vote per election.
     */
    const existingVoteSnap = await fs
      .collection("votes")
      .where("voterId", "==", voterId)
      .where("electionId", "==", electionId)
      .limit(1)
      .get();

    if (!existingVoteSnap.empty) {
      return res.status(409).json({
        message: "You have already voted in this election.",
      });
    }

    /**
     * Step 6: Check whether the voter has an available voting token.
     * A token is required to cast a vote.
     */
    const walletDocRef = fs.collection("wallets").doc(voterId);
    const walletDoc = await walletDocRef.get();
    const voterWallet = walletDoc.exists ? (walletDoc.data() as any) : null;

    if (!voterWallet || (voterWallet.tokens ?? 0) <= 0) {
      return res.status(403).json({
        message: "No vote tokens available.",
      });
    }

    /**
     * Step 7: Validate that the candidate exists,
     * belongs to the requested election,
     * and is currently active.
     */
    const candidateDoc = await fs.collection("candidates").doc(candidateId).get();
    const candidate = candidateDoc.exists ? (candidateDoc.data() as any) : null;
    if (!candidate || candidate.electionId !== electionId || candidate.active !== true) {
      return res.status(404).json({
        message: "Candidate not found or not active in this election.",
      });
    }

    /**
     * Step 8: Generate blockchain-style transaction metadata.
     * - transactionKey: unique key for this vote transaction
     * - signature: cryptographic signature tied to voter identity
     */
    const transactionKey = generateTransactionKey(
      voterId,
      electionId,
      candidateId
    );

    const signature = generateSignature(transactionKey, voterId);

    /**
     * Step 9: Create a cryptographic commitment.
     * This adds another verifiable layer to the vote record.
     */
    const commitment = crypto
      .createHash("sha256")
      .update(`${candidateId}:${voterId}:${Date.now()}`)
      .digest("hex");

    /**
     * Step 10: Store the vote in the database.
     */
    const newVote = {
      voterId,
      electionId,
      candidateId,
      transactionKey,
      signature,
      commitment,
      timestamp: new Date().toISOString(),
    };
    const voteRef = fs.collection("votes").doc();

    await fs.runTransaction(async (tx) => {
      const freshWallet = await tx.get(walletDocRef);
      const w = freshWallet.exists ? (freshWallet.data() as any) : null;
      if (!w || (w.tokens ?? 0) <= 0) throw new Error("NO_TOKENS");
      tx.set(voteRef, { ...newVote, id: voteRef.id });
      tx.update(walletDocRef, { tokens: (w.tokens ?? 0) - 1 });
      tx.set(
        fs.collection("voterElections").doc(`${voterId}_${electionId}`),
        { voterId, electionId, status: "complete", updatedAt: new Date().toISOString() },
        { merge: true }
      );
    });

    /**
     * Step 14: Return success response.
     */
    return res.status(200).json({
      message: "Vote cast successfully.",
      transactionKey,
      signature,
    });
  } catch (error) {
    console.error("Error while casting vote:", error);

    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}
