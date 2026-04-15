import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { loadSimpleElectionDeployment } from "../../../lib/simpleElectionArtifact";

type Success = { phase: number; isVotingOpen: boolean; exists: boolean; networkId: string; address: string };
type ErrorRes = { message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Success | ErrorRes>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const electionId = typeof req.query.electionId === "string" ? req.query.electionId : "";
    if (!electionId) return res.status(400).json({ message: "electionId is required" });
    const dep = await loadSimpleElectionDeployment();
    if (!dep) return res.status(500).json({ message: "Deployment not found" });
    const rpc = process.env.ETH_RPC_URL || "http://127.0.0.1:7545";
    const provider = new ethers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(dep.address, dep.abi, provider);
    const electionKey = ethers.id(electionId);
    const election = await contract.getElection(electionKey);
    const exists = Boolean(election?.[0]);
    const phase = exists ? Number(election?.[2] ?? 0) : 0;
    return res.status(200).json({
      phase,
      isVotingOpen: exists && phase === 1,
      exists,
      networkId: dep.networkId,
      address: dep.address,
    });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Cannot read voting status" });
  }
}
