import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { ensureSeedData } from "../../lib/firestoreRepo";
import { getFirestore } from "../../lib/firebaseAdmin";
import { loadSimpleElectionDeployment } from "../../lib/simpleElectionArtifact";

function namePartyKey(name: string, party: string | undefined): string {
  return `${String(name || "").trim()}|${String(party || "").trim()}`;
}

/** Đọc voteCount on-chain từ SimpleElection (RPC local). Lỗi RPC → map rỗng. */
async function getOnChainTallyByNameKey(electionId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rpc = process.env.ETH_RPC_URL || "http://127.0.0.1:7545";
  try {
    const dep = await loadSimpleElectionDeployment();
    if (!dep) return map;
    const provider = new ethers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(dep.address, dep.abi, provider);
    if (!electionId) return map;
    const electionKey = ethers.id(electionId);
    const election = await contract.getElection(electionKey);
    const exists = Boolean(election?.[0]);
    if (!exists) return map;
    const count = Number(await contract.candidateCountOf(electionKey));
    if (!Number.isFinite(count) || count <= 0) return map;
    for (let i = 1; i <= count; i++) {
      const row = await contract.getCandidate(electionKey, i);
      if (row?.[4]) {
        map.set(namePartyKey(String(row[1]), String(row[2] || "")), Number(row[3]));
      }
    }
  } catch {
    // Ganache tắt / sai port — chỉ dùng Firestore
  }
  return map;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  const electionId = typeof req.query.electionId === "string" ? req.query.electionId : "";

  await ensureSeedData();
  const fs = getFirestore();

  let candidatesQuery: any = fs.collection("candidates");
  if (electionId) candidatesQuery = candidatesQuery.where("electionId", "==", electionId);
  const candidatesSnap = await candidatesQuery.get();
  const candidates = candidatesSnap.docs.map((d: any) => d.data() as any);

  let votesQuery: any = fs.collection("votes");
  if (electionId) votesQuery = votesQuery.where("electionId", "==", electionId);
  const votesSnap = await votesQuery.get();
  const votes = votesSnap.docs.map((d: any) => d.data() as any);

  const countByCandidate = new Map<string, number>();
  for (const v of votes) {
    const k = v.candidateId;
    countByCandidate.set(k, (countByCandidate.get(k) || 0) + 1);
  }

  const chainByKey = await getOnChainTallyByNameKey(electionId);
  const useChain = chainByKey.size > 0;

  const candidateData = candidates.map((candidate: any) => {
    const firestoreVotes = countByCandidate.get(candidate.id) || 0;
    const key = namePartyKey(candidate.name, candidate.party);
    const onChain = chainByKey.get(key);
    const tokens = useChain && onChain !== undefined ? onChain : firestoreVotes;
    return {
      name: candidate.name,
      party: candidate.party,
      public_key: `0x${String(candidate.id).replace(/-/g, "").slice(0, 40).toUpperCase()}`,
      tokens,
      location: candidate.electionId,
    };
  });

  return res.status(200).json({ wallets: candidateData });
}
