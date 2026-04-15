import { ethers } from "ethers";

function getEthereum() {
  return (window as any).ethereum;
}

let pendingPermissionRequest: Promise<any> | null = null;

function isMetaMaskPendingRequestError(e: any) {
  const msg = String(e?.message || "");
  return e?.code === -32002 || msg.includes("already pending") || msg.includes("Request of type");
}

function isUserRejected(e: any) {
  // EIP-1193 userRejectedRequest
  return e?.code === 4001 || String(e?.message || "").toLowerCase().includes("user rejected");
}

export async function requestMetaMaskAccounts() {
  const eth = getEthereum();
  if (!eth) throw new Error("Cần cài MetaMask để tiếp tục.");
  const provider = new ethers.BrowserProvider(eth);
  // This may trigger a MetaMask popup if the site isn't authorized yet.
  try {
    const accounts: string[] = await provider.send("eth_requestAccounts", []);
    return (accounts?.[0] || "").toLowerCase();
  } catch (e: any) {
    if (isUserRejected(e)) {
      throw new Error("Bạn đã hủy yêu cầu trên MetaMask.");
    }
    if (isMetaMaskPendingRequestError(e)) {
      throw new Error("MetaMask đang có một yêu cầu đang chờ. Hãy mở MetaMask và hoàn tất popup trước, rồi tải lại trang.");
    }
    throw e;
  }
}

export async function requestMetaMaskAccountSwitch() {
  const eth = getEthereum();
  if (!eth) throw new Error("Cần cài MetaMask để tiếp tục.");
  // MetaMask doesn't allow programmatic account switching without user interaction.
  // Requesting permissions typically opens a MetaMask UI that lets the user pick accounts.
  if (!pendingPermissionRequest) {
    pendingPermissionRequest = (async () => {
      try {
        await eth.request?.({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (e: any) {
        if (isUserRejected(e)) {
          throw new Error("Bạn đã hủy yêu cầu trên MetaMask.");
        }
        if (isMetaMaskPendingRequestError(e)) {
          // A request is already pending; let caller handle by waiting for user.
          throw new Error("MetaMask đang mở popup chọn ví. Hãy chọn đúng ví trong MetaMask rồi tải lại trang.");
        }
        throw e;
      }
    })().finally(() => {
      pendingPermissionRequest = null;
    });
  }

  await pendingPermissionRequest;
  return await requestMetaMaskAccounts();
}

export async function getConnectedMetaMaskAddress() {
  const eth = getEthereum();
  if (!eth) throw new Error("Cần cài MetaMask để tiếp tục.");
  const provider = new ethers.BrowserProvider(eth);
  const accounts: string[] = await provider.send("eth_accounts", []);
  return (accounts?.[0] || "").toLowerCase();
}

export async function requireMatchingWallet(params: {
  token: string;
  getLinkedWallet: (token: string) => Promise<{ wallet?: { public_key?: string } }>;
}) {
  const mm = await getConnectedMetaMaskAddress();
  if (!mm) {
    throw new Error("Bạn chưa kết nối MetaMask. Hãy bấm “Kết nối MetaMask” để tiếp tục.");
  }

  const linkedRes = await params.getLinkedWallet(params.token);
  const linked = linkedRes?.wallet?.public_key?.toLowerCase();
  if (!linked) throw new Error("Tài khoản chưa liên kết ví.");

  if (linked !== mm) {
    throw new Error("Ví MetaMask hiện tại không khớp ví đã liên kết. Hãy chuyển đúng tài khoản ví trong MetaMask.");
  }
}

export async function ensureMatchingWalletAutoFix(params: {
  token: string;
  getLinkedWallet: (token: string) => Promise<{ wallet?: { public_key?: string } }>;
  attempts?: number; // number of auto-fix attempts (popup) on mismatch
}) {
  const linkedRes = await params.getLinkedWallet(params.token);
  const linked = linkedRes?.wallet?.public_key?.toLowerCase();
  if (!linked) throw new Error("Tài khoản chưa liên kết ví.");

  // If not connected yet, connect (may open popup).
  let mm = await getConnectedMetaMaskAddress();
  if (!mm) {
    mm = await requestMetaMaskAccounts();
  }

  if (mm && linked === mm) return;

  const max = Math.max(0, params.attempts ?? 1);
  for (let i = 0; i < max; i++) {
    // Try to prompt MetaMask UI to allow switching/selecting accounts.
    await requestMetaMaskAccountSwitch();
    mm = await getConnectedMetaMaskAddress();
    if (mm && linked === mm) return;
  }

  throw new Error(
    "Ví MetaMask hiện tại không khớp ví đã liên kết. Hãy mở MetaMask và chuyển sang đúng tài khoản ví (đúng địa chỉ), rồi tải lại trang."
  );
}

