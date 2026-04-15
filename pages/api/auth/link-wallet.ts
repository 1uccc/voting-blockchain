import type { NextApiRequest, NextApiResponse } from "next";
import admin from "firebase-admin";
import { getFirestore } from "../../../lib/firebaseAdmin";
import { linkWalletToFirebaseUser } from "../../../lib/firestoreRepo";

type Body = { idToken: string; walletAddress: string };
type Res = { ok: true } | { message: string };

function isEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

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

    const { idToken, walletAddress } = req.body as Body;
    if (!idToken || !walletAddress) {
      return res.status(400).json({ message: "idToken and walletAddress are required" });
    }
    if (!isEthAddress(walletAddress.trim())) {
      return res.status(400).json({ message: "Invalid wallet address" });
    }

    const auth = requireAdminInitialized();
    const decoded = await auth.verifyIdToken(idToken);
    const emailLower = (decoded.email || "").toLowerCase();
    if (!emailLower) return res.status(400).json({ message: "No email in token" });
    const fs = getFirestore();
    const adminDoc = await fs.collection("admins").doc(emailLower).get();
    const isAdmin = adminDoc.exists;
    const requiredAdminWallet = (process.env.ADMIN_WALLET_ADDRESS || "").toLowerCase().trim();
    const submittedWallet = walletAddress.trim().toLowerCase();
    if (isAdmin && requiredAdminWallet && submittedWallet !== requiredAdminWallet) {
      return res.status(403).json({
        message: "Sai ví admin. Hãy dùng đúng ví admin đã cấu hình.",
      });
    }

    try {
      await linkWalletToFirebaseUser({
        uid: decoded.uid,
        emailLower,
        publicKey: walletAddress.trim(),
      });
    } catch (e: any) {
      if (e?.message === "EMAIL_ALREADY_LINKED") {
        return res.status(409).json({ message: "This email is already linked to a wallet." });
      }
      if (e?.message === "WALLET_ALREADY_LINKED") {
        return res.status(409).json({ message: "This wallet is already linked to another email." });
      }
      throw e;
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("link-wallet error:", e);
    return res.status(500).json({ message: e?.message || "Internal server error" });
  }
}

