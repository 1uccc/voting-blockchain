import type { NextApiRequest, NextApiResponse } from "next";
import { verifyToken } from "../../../lib/auth";
import { getFirestore } from "../../../lib/firebaseAdmin";

type Res =
  | { ok: true; candidate: any }
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
      const id = String(body.id || body._id || "").trim();
      const name = String(body.name || "").trim();
      const electionId = String(body.electionId || "").trim();

      if (!id) return res.status(400).json({ message: "Thiếu mã ứng viên (id)." });
      if (!name) return res.status(400).json({ message: "Thiếu tên ứng viên (name)." });
      if (!electionId) return res.status(400).json({ message: "Thiếu mã cuộc bầu cử (electionId)." });

      // ensure election exists
      const eDoc = await fs.collection("elections").doc(electionId).get();
      if (!eDoc.exists) return res.status(400).json({ message: "electionId không tồn tại trong hệ thống." });

      const docRef = fs.collection("candidates").doc(id);
      const now = new Date().toISOString();

      const candidate = {
        id,
        _id: id,
        name,
        party: String(body.party || ""),
        image: String(body.image || ""),
        active: body.active === false ? false : true,
        electionId,
        manifesto: String(body.manifesto || ""),
        voteCount: Number(body.voteCount || 0),
        updatedAt: now,
      };

      if (req.method === "POST") {
        const exists = await docRef.get();
        if (exists.exists) return res.status(409).json({ message: "Mã ứng viên đã tồn tại." });
        await docRef.set({ ...candidate, createdAt: now });
      } else {
        await docRef.set(candidate, { merge: true });
      }

      return res.status(200).json({ ok: true, candidate });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      const id = String(body.id || body._id || "").trim();
      if (!id) return res.status(400).json({ message: "Thiếu mã ứng viên (id)." });

      await fs.collection("candidates").doc(id).delete();
      return res.status(200).json({ ok: true, id });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    console.error("admin/candidates error:", e);
    return res.status(500).json({ message: e?.message || "Internal server error" });
  }
}

