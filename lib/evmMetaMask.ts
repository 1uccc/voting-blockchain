import { ethers } from "ethers";

function ganacheRpcUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_GANACHE_RPC_URL) {
    return process.env.NEXT_PUBLIC_GANACHE_RPC_URL;
  }
  return "http://127.0.0.1:7545";
}

/**
 * Đưa MetaMask sang đúng chain với Truffle artifact (ETH_NETWORK_ID).
 * Thử `wallet_switchEthereumChain`; nếu chưa có mạng (4902) thì `wallet_addEthereumChain` (Ganache local).
 */
export async function ensureMetaMaskChainMatchesArtifact(
  ethereum: any,
  artifactNetworkId: string | undefined
): Promise<void> {
  if (!artifactNetworkId) return;
  const want = String(artifactNetworkId).trim();
  const rpc = ganacheRpcUrl();

  const readChain = async () => {
    const p = new ethers.BrowserProvider(ethereum);
    const n = await p.getNetwork();
    return n.chainId.toString();
  };

  if ((await readChain()) === want) return;

  const chainIdHex = "0x" + BigInt(want).toString(16);

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (e: any) {
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Ganache Local",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [rpc],
          },
        ],
      });
    } else if (code === 4001) {
      throw new Error(
        `Bạn đã huỷ chuyển mạng. Cần chọn mạng có chain ID ${want} (Ganache, RPC ${rpc}) để dùng contract deploy.`
      );
    } else {
      throw new Error(
        `Không thể chuyển sang chain ${want}: ${e?.message || "unknown error"}. Trong MetaMask hãy thêm mạng thủ công: Chain ID ${want}, RPC ${rpc}.`
      );
    }
  }

  await new Promise((r) => setTimeout(r, 400));
  const got = await readChain();
  if (got !== want) {
    throw new Error(
      `MetaMask vẫn chưa ở chain ${want} (đang ${got}). Chọn mạng Ganache (chain ${want}) trong MetaMask — RPC ${rpc}.`
    );
  }
}
