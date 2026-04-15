import type { NextApiRequest, NextApiResponse } from "next";
import admin from "firebase-admin";
import { signToken } from "../../../lib/auth";
import { getFirestore } from "../../../lib/firebaseAdmin";

type Body = { idToken: string };
type Res =
  | {
      user: {
        id: string;
        name: string;
        email: string;
        role: "admin" | "voter";
        isLoggedIn: true;
        token: string;
      };
      token: string;
    }
  | { message: string };

function requireAdminInitialized() {
  // Ensure firebase-admin app initialized via firestore getter
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
    const { idToken } = req.body as Body;
    if (!idToken) return res.status(400).json({ message: "idToken is required" });

    const auth = requireAdminInitialized();
    const decoded = await auth.verifyIdToken(idToken);
    const email = (decoded.email || "").toLowerCase();
    if (!email) return res.status(400).json({ message: "No email in token" });

    const fs = getFirestore();
    const adminDoc = await fs.collection("admins").doc(email).get();
    const role: "admin" | "voter" = adminDoc.exists ? "admin" : "voter";
    const signInProvider = String((decoded as any)?.firebase?.sign_in_provider || "");

    // Security policy:
    // - Voter accounts must use Google sign-in (reduce spam with disposable password accounts).
    // - Only admin can use traditional email/password login.
    if (role === "voter" && signInProvider === "password") {
      return res.status(403).json({
        message: "Tài khoản voter chỉ được đăng nhập bằng Google. Email/password chỉ dành cho admin.",
      });
    }
    if (role === "admin") {
      const requiredAdminWallet = (process.env.ADMIN_WALLET_ADDRESS || "").toLowerCase().trim();
      if (requiredAdminWallet) {
        const walletDoc = await fs.collection("wallets").doc(decoded.uid).get();
        if (walletDoc.exists) {
          const linked = String((walletDoc.data() as any)?.public_key || "").toLowerCase();
          if (linked && linked !== requiredAdminWallet) {
            return res.status(403).json({
              message: "Ví liên kết của admin không hợp lệ. Hãy liên kết lại đúng ví admin đã cấu hình.",
            });
          }
        }
      }
    }

    // Prefer profile from Firestore (for email/password signups where decoded.name may be empty)
    const profileDoc = await fs.collection("voters").doc(decoded.uid).get();
    const profile = profileDoc.exists ? (profileDoc.data() as any) : null;
    const displayName =
      profile?.name ||
      decoded.name ||
      (role === "admin" ? "Admin" : "User");

    const token = signToken({
      id: decoded.uid,
      email,
      role,
      provider: "firebase",
    });

    return res.status(200).json({
      user: {
        id: decoded.uid,
        name: displayName,
        email,
        role,
        isLoggedIn: true,
        token,
      },
      token,
    });
  } catch (e: any) {
    console.error("firebase-login error:", e);
    return res.status(500).json({ message: e?.message || "Internal server error" });
  }
}

