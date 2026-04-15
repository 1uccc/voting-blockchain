import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { getFirestore } from "../../../lib/firebaseAdmin";
import { ensureVoterElectionForAllVotersForElection } from "../../../lib/firestoreRepo";

type Res =
  | { ok: true; election: any }
  | { ok: true; id: string }
  | { message: string };

function requireAdmin(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== "admin") return null;
  return decoded;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Res>) {
  try {
    const admin = requireAdmin(req);
    if (!admin) return res.status(403).json({ message: "Forbidden" });

    const fs = getFirestore();

    if (req.method === "POST" || req.method === "PUT") {
      const body = req.body || {};
      const _id = String(body._id || "").trim();
      const name = String(body.name || "").trim();
      if (!_id) return res.status(400).json({ message: "Thiếu mã cuộc bầu cử (_id)." });
      if (!name) return res.status(400).json({ message: "Thiếu tên cuộc bầu cử (name)." });

      const docRef = fs.collection("elections").doc(_id);
      const now = new Date().toISOString();

      const election = {
        _id,
        name,
        description: String(body.description || ""),
        date: String(body.date || ""),
        endDate: String(body.endDate || ""),
        status: String(body.status || "active"),
        image: String(body.image || ""),
        totalVoters: Number(body.totalVoters || 0),
        category: String(body.category || ""),
        updatedAt: now,
      };

      if (req.method === "POST") {
        const exists = await docRef.get();
        if (exists.exists) {
          return res.status(409).json({ message: "Mã cuộc bầu cử đã tồn tại." });
        }
        await docRef.set({ ...election, createdAt: now });
        await ensureVoterElectionForAllVotersForElection(_id);
      } else {
        await docRef.set(election, { merge: true });
      }

      return res.status(200).json({ ok: true, election });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      const _id = String(body._id || "").trim();
      if (!_id) return res.status(400).json({ message: "Thiếu mã cuộc bầu cử (_id)." });

      // Also soft-check: candidates remain; we don't cascade delete automatically.
      await fs.collection("elections").doc(_id).delete();
      return res.status(200).json({ ok: true, id: _id });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    console.error("admin/elections error:", e);
    return res.status(500).json({ message: e?.message || "Internal server error" });
  }
}

