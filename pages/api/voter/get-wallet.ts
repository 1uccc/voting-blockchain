import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { ensureSeedData, getWalletForToken } from "../../../lib/firestoreRepo";

type DecodedToken = {
  id: string;
  email?: string;
  [key: string]: unknown;
};

type WalletResponse = {
  wallet: {
    public_key: string;
    tokens: number;
  };
};

type ErrorResponse = {
  message: string;
};

type ApiResponse = WalletResponse | ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  try {
    /**
     * Step 1: Allow only GET requests.
     * Reject any other HTTP method.
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

    const token = authHeader.split(" ")[1];

    /**
     * Step 3: Verify the token.
     * If the token is invalid or expired, deny access.
     */
    const decoded = verifyToken(token) as DecodedToken | null;

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        message: "Invalid or expired token.",
      });
    }

    await ensureSeedData();
    const wallet = await getWalletForToken({
      id: decoded.id,
      emailLower: decoded.email ? String(decoded.email).toLowerCase() : undefined,
    });

    if (!wallet) {
      return res.status(404).json({
        message: "Wallet not found.",
      });
    }

    /**
     * Step 6: Return wallet details.
     * Expose only the fields needed by the client.
     */
    return res.status(200).json({
      wallet: {
        public_key: wallet.publicKey,
        tokens: wallet.tokens,
      },
    });
  } catch (error) {
    console.error("Error fetching wallet details:", error);

    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}
