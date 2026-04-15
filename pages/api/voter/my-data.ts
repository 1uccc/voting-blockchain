import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { ensureSeedData, ensureVoterElectionMappingsForVoter } from "../../../lib/firestoreRepo";
import { getFirestore } from "../../../lib/firebaseAdmin";

type DecodedToken = {
  id: string;
  [key: string]: unknown;
};

type VoterProfile = {
  id: string;
  name: string;
  email: string;
  locationId?: string;
};

type ElectionSummary = {
  status: string;
  election: {
    _id: string;
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    [key: string]: unknown;
  } | null;
};

type SuccessResponse = {
  voter: VoterProfile;
  elections: ElectionSummary[];
};

type ErrorResponse = {
  message: string;
};

type ApiResponse = SuccessResponse | ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    /**
     * Step 1: Only allow GET requests.
     */
    if (req.method !== "GET") {
      return res.status(405).json({
        message: "Method not allowed. Only GET requests are supported.",
      });
    }

    /**
     * Step 2: Validate Authorization header.
     * Expected format:
     * Authorization: Bearer <token>
     */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized. Bearer token is required.",
      });
    }

    /**
     * Step 3: Extract token and verify it.
     */
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token) as DecodedToken | null;

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        message: "Invalid or expired token.",
      });
    }

    await ensureSeedData();
    const fs = getFirestore();
    const voterDoc = await fs.collection("voters").doc(decoded.id).get();
    const voter = voterDoc.exists ? (voterDoc.data() as any) : null;

    if (!voter) {
      return res.status(404).json({
        message: "Voter not found.",
      });
    }

    // Cuộc bầu cử tạo sau khi user đăng ký: bổ sung voterElections thiếu.
    await ensureVoterElectionMappingsForVoter(voter.id);

    const mappingsSnap = await fs
      .collection("voterElections")
      .where("voterId", "==", voter.id)
      .get();
    const mappings = mappingsSnap.docs.map((d) => d.data() as any);

    const electionIds = Array.from(new Set(mappings.map((m) => m.electionId)));
    const electionDocs = await Promise.all(
      electionIds.map((id: string) => fs.collection("elections").doc(id).get())
    );
    const electionById = new Map<string, any>();
    for (const doc of electionDocs) {
      if (doc.exists) electionById.set(doc.id, doc.data());
    }

    const elections: ElectionSummary[] = mappings.map((mapping: any) => {
      const raw = electionById.get(mapping.electionId) || null;
      const ev = raw
        ? {
            ...raw,
            _id: raw._id || mapping.electionId,
            name: raw.name || raw.title,
            date: raw.date || raw.startDate,
            endDate: raw.endDate,
          }
        : null;
      return {
        status: mapping.status,
        election: ev,
      };
    });

    /**
     * Step 7: Return voter profile and linked elections.
     */
    return res.status(200).json({
      voter: {
        id: voter.id,
        name: voter.name,
        email: voter.email,
        locationId: voter.locationId,
      },
      elections,
    });
  } catch (error) {
    console.error("Error fetching voter profile and elections:", error);

    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}
