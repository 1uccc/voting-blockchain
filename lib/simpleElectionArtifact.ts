import path from "path";
import { promises as fs } from "fs";

export type SimpleElectionDeployment = { address: string; abi: any; networkId: string };

function pickDeployment(parsed: any): { networkId: string; address: string } | null {
  const networks = parsed?.networks || {};
  const preferred = process.env.ETH_NETWORK_ID;
  if (preferred && networks[preferred]?.address) {
    return { networkId: String(preferred), address: networks[preferred].address };
  }
  const tryOrder = ["1337", "5777", "31337"];
  for (const id of tryOrder) {
    if (networks[id]?.address) return { networkId: id, address: networks[id].address };
  }
  for (const id of Object.keys(networks)) {
    if (networks[id]?.address) return { networkId: id, address: networks[id].address };
  }
  return null;
}

export async function loadSimpleElectionDeployment(): Promise<SimpleElectionDeployment | null> {
  try {
    const artifactPath = path.join(process.cwd(), "ethereum", "build", "contracts", "MultiElection.json");
    const raw = await fs.readFile(artifactPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    const picked = pickDeployment(parsed);
    if (!picked || !parsed?.abi) return null;
    return { address: picked.address, abi: parsed.abi, networkId: picked.networkId };
  } catch {
    return null;
  }
}
