import type { NextApiRequest, NextApiResponse } from "next";
import { loadSimpleElectionDeployment } from "../../../lib/simpleElectionArtifact";

type Success = { address: string; abi: unknown; networkId: string };
type ErrorRes = { message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Success | ErrorRes>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const picked = await loadSimpleElectionDeployment();
    if (!picked) {
      const hint = process.env.ETH_NETWORK_ID
        ? ` (ETH_NETWORK_ID=${process.env.ETH_NETWORK_ID})`
        : "";
      return res.status(500).json({
        message:
          `Truffle artifact không có địa chỉ deploy hợp lệ${hint}. Hãy chạy: cd ethereum && npm install && npm run migrate (Ganache đang bật, cùng RPC/port với truffle-config).`,
      });
    }

    return res.status(200).json({
      address: picked.address,
      abi: picked.abi,
      networkId: picked.networkId,
    });
  } catch {
    return res.status(500).json({
      message:
        "Ethereum deployment not found. Start Ganache, then run: cd ethereum && npm install && npm run migrate",
    });
  }
}
