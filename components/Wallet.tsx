import React, { useCallback, useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { WalletState, authState } from "../atoms";
import { GetVoterWallet } from "../lib/api";
import { toast } from "react-hot-toast";
import Spinner from "./ui/Spinner";
import { ethers } from "ethers";
import { OutlinedButton } from "./ui/Button";

const Wallet: React.FC<{}> = () => {
  const [loading, setLoading] = useState(false);
  const auth = useRecoilValue(authState);
  const [wallet, setWallet] = useRecoilState(WalletState);
  const [mmConnected, setMmConnected] = useState(false);
  const [chainId, setChainId] = useState<string>("");
  const [linkedAddress, setLinkedAddress] = useState<string>("");
  const [linkedTokens, setLinkedTokens] = useState<number>(0);
  const [mismatchWarned, setMismatchWarned] = useState(false);

  const getWallet = useCallback(async () => {
    try {
      setLoading(true);
      const data = await GetVoterWallet(auth?.token);
      const W = data?.wallet;
      if (W) {
        setLinkedAddress(W?.public_key || "");
        setLinkedTokens(Number(W?.tokens ?? 0));

        // If MetaMask isn't connected yet, show the linked wallet as default.
        if (!mmConnected) {
          setWallet({ public_key: W?.public_key, tokens: W?.tokens });
        }
      } else {
        throw new Error();
      }
    } catch {
      // If user uses MetaMask-only flow, backend wallet may be irrelevant.
    } finally {
      setLoading(false);
    }
  }, [auth?.token, setWallet]);

  const connectMetaMask = useCallback(async () => {
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        toast.error("Không phát hiện MetaMask.", {
          style: { background: "#111", color: "#fff" },
        });
        return;
      }
      const provider = new ethers.BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const net = await provider.getNetwork();

      setWallet((w) => ({
        ...w,
        public_key: address,
        // Prefer backend-issued tokens if available; otherwise keep >=1 for demo usability.
        tokens: Math.max(1, linkedTokens || w.tokens || 0),
      }));
      setMmConnected(true);
      setChainId(net.chainId.toString());
    } catch {
      toast.error("Kết nối MetaMask thất bại.", {
        style: { background: "#111", color: "#fff" },
      });
    }
  }, [setWallet]);

  const tryAutoConnect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      const provider = new ethers.BrowserProvider(eth);
      const accounts: string[] = await provider.send("eth_accounts", []);
      if (!accounts?.length) return;
      const net = await provider.getNetwork();
      setWallet((w) => ({
        ...w,
        public_key: accounts[0],
        tokens: Math.max(1, linkedTokens || w.tokens || 0),
      }));
      setMmConnected(true);
      setChainId(net.chainId.toString());
    } catch {
      // ignore
    }
  }, [setWallet]);

  useEffect(() => {
    tryAutoConnect();
    // keep legacy API wallet as fallback (demo auth mode)
    getWallet();
  }, []);

  const normalizedLinked = linkedAddress?.toLowerCase();
  const normalizedMm = wallet?.public_key?.toLowerCase();
  const isMismatch =
    mmConnected &&
    !!normalizedLinked &&
    !!normalizedMm &&
    normalizedLinked !== normalizedMm;

  useEffect(() => {
    if (isMismatch && !mismatchWarned) {
      setMismatchWarned(true);
      toast.error("Ví MetaMask hiện tại không khớp ví đã liên kết với email này.", {
        style: { background: "#222", color: "#FF1A1A" },
      });
    }
  }, [isMismatch, mismatchWarned]);

  const shortKey = wallet?.public_key
    ? `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-6)}`
    : "–";
  const linkedShortKey = linkedAddress
    ? `${linkedAddress.slice(0, 6)}...${linkedAddress.slice(-6)}`
    : "–";

  return (
    <div className="w-80 flex-shrink-0 flex flex-col gap-4">
      {/* Voter Wallet Card */}
      <div className="glass-card p-5 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B38FB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4 2 2 0 000-4z"/>
              </svg>
            </div>
            <span className="font-display font-semibold text-white text-sm">Ví cử tri</span>
          </div>
          <div className="flex items-center gap-2">
            <OutlinedButton onClick={connectMetaMask} className="px-3 py-1.5 text-xs">
              {mmConnected ? "Đã kết nối" : "Kết nối MetaMask"}
            </OutlinedButton>
            <button
              onClick={getWallet}
              className="w-7 h-7 rounded-lg border border-border/50 flex items-center justify-center text-muted hover:text-white hover:border-primary/50 transition-all duration-200"
              title="Làm mới ví"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Address */}
        <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
          <p className="text-xs text-muted mb-1 uppercase tracking-wider font-medium">Địa chỉ ví</p>
          <p className="text-sm text-white font-mono">{shortKey}</p>
          {mmConnected && chainId && (
            <p className="text-[11px] text-muted mt-1 font-mono">chainId: {chainId}</p>
          )}
        </div>

        {/* Linked wallet check */}
        {auth?.isLoggedIn && linkedAddress && (
          <div
            className={`rounded-xl px-4 py-3 border ${
              isMismatch
                ? "bg-error/10 border-error/20"
                : "bg-success/10 border-success/20"
            }`}
          >
            <p className="text-xs text-muted mb-1 uppercase tracking-wider font-medium">
              Ví đã liên kết (theo email)
            </p>
            <p className="text-sm text-white font-mono">{linkedShortKey}</p>
            {isMismatch ? (
              <p className="text-xs text-error mt-1">
                Cảnh báo: ví MetaMask đang khác ví đã liên kết. Hãy chuyển đúng tài khoản trong MetaMask.
              </p>
            ) : (
              <p className="text-xs text-success mt-1">MetaMask khớp với ví đã liên kết.</p>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="glass-card p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Cách bỏ phiếu</p>
        {[
          { icon: "1", text: "Chọn một cuộc bầu cử" },
          { icon: "2", text: "Xem danh sách ứng viên" },
          { icon: "3", text: "Bỏ phiếu (một giao dịch vote on-chain)" },
          { icon: "4", text: "Giữ transaction hash để xác minh trên Validate" },
        ].map((step) => (
          <div key={step.icon} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {step.icon}
            </div>
            <p className="text-xs text-muted">{step.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Wallet;
