import { useCallback, useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useRouter } from "next/router";
import { authState } from "../atoms";
import Navbar from "../components/layout/Navbar";
import Wallet from "../features/wallet/components/WalletPanel";
import { GetVoterByID } from "../lib/api";
import { Election } from "../features/elections/components/ElectionCard";
import { toast } from "react-hot-toast";
import Elections from "../features/elections/components/ElectionsList";
import Spinner from "../components/ui/Spinner";
import { GetVoterWallet } from "../lib/api";
import { OutlinedButton } from "../components/ui/Button";
import {
  ensureMatchingWalletAutoFix,
  getConnectedMetaMaskAddress,
} from "../lib/walletGuard";

const Dashboard = () => {
  const auth = useRecoilValue(authState);
  const router = useRouter();
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(false);
  const [walletBlocked, setWalletBlocked] = useState<{ message: string } | null>(null);
  const [walletChecking, setWalletChecking] = useState(true);
  const [onchainStatusByElection, setOnchainStatusByElection] = useState<
    Record<string, { exists: boolean; phase: number; isVotingOpen: boolean }>
  >({});
  const [linkedWalletHint, setLinkedWalletHint] = useState<string>("");
  const [mmWalletHint, setMmWalletHint] = useState<string>("");
  const displayName = auth?.name || "Voter";
  const firstName = displayName.split(" ")[0];

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Chào buổi sáng";
    if (h < 17) return "Chào buổi chiều";
    return "Chào buổi tối";
  };

  const getData = async () => {
    try {
      if (!auth.token) return;
      setLoading(true);
      const data = await GetVoterByID(auth.token);
      const E = data?.elections?.map((row: any) => {
        const ev = row?.election || {};
        return {
          ...ev,
          _id: ev._id || ev.id,
          name: ev.name || ev.title || "Cuộc bầu cử",
          date: ev.date || ev.startDate || "",
          endDate: ev.endDate,
          category: ev.category,
          description: ev.description,
          totalVoters: ev.totalVoters,
          image: ev.image,
          status: row.status,
        };
      });
      setElections(E || []);
      const ids = (E || []).map((x: any) => x?._id).filter(Boolean);
      const statuses = await Promise.all(
        ids.map(async (id: string) => {
          try {
            const r = await fetch(`/api/eth/voting-status?electionId=${encodeURIComponent(id)}`);
            const j = await r.json();
            return [
              id,
              {
                exists: !!j?.exists,
                phase: Number(j?.phase || 0),
                isVotingOpen: !!j?.isVotingOpen,
              },
            ] as const;
          } catch {
            return [id, { exists: false, phase: 0, isVotingOpen: false }] as const;
          }
        })
      );
      setOnchainStatusByElection(Object.fromEntries(statuses));
    } catch {
      toast.error("Không thể tải dữ liệu người dùng.", { style: { background: "#111", color: "#fff" } });
    } finally {
      setLoading(false);
    }
  };

  const checkWalletThenLoad = useCallback(async () => {
    if (!auth?.token) return;
    setWalletBlocked(null);
    setWalletChecking(true);
    try {
      // Pre-fetch hints so user knows which account to pick in MetaMask.
      const linkedRes = await GetVoterWallet(auth.token);
      const linked = (linkedRes?.wallet?.public_key || "").toLowerCase();
      setLinkedWalletHint(linked);
      try {
        const mm = await getConnectedMetaMaskAddress();
        setMmWalletHint(mm || "");
      } catch {
        setMmWalletHint("");
      }

      // Reuse fetched linked wallet for the check to avoid double fetch.
      const getLinkedWalletCached = async () => linkedRes;
      await ensureMatchingWalletAutoFix({ token: auth.token, getLinkedWallet: getLinkedWalletCached, attempts: 1 });
      await getData();
    } catch (e: any) {
      setWalletBlocked({ message: e?.message || "Không thể xác thực ví MetaMask." });
    } finally {
      setWalletChecking(false);
    }
  }, [auth?.token]);

  useEffect(() => {
    if (!auth?.isLoggedIn) {
      router.push("/");
      return;
    }
    if (auth.role === "admin") {
      router.push("/admin");
      return;
    }
    checkWalletThenLoad();
  }, [auth?.isLoggedIn, auth?.token]);

  const totalActive = elections.filter((e) => e.status === "incomplete").length;
  const totalDone = elections.filter((e) => e.status === "complete").length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {walletBlocked ? (
          <div className="glass-card p-6 md:p-8 mt-6">
            <h2 className="text-xl font-display font-bold text-white">Cần đúng ví MetaMask để vào Dashboard</h2>
            <p className="text-sm text-muted mt-2">{walletBlocked.message}</p>
            {(linkedWalletHint || mmWalletHint) && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {linkedWalletHint && (
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted mb-1 uppercase tracking-wider font-medium">Ví đã liên kết</p>
                    <p className="text-sm text-white font-mono">
                      …{linkedWalletHint.slice(-4)}
                    </p>
                  </div>
                )}
                {mmWalletHint && (
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted mb-1 uppercase tracking-wider font-medium">Ví MetaMask hiện tại</p>
                    <p className="text-sm text-white font-mono">
                      …{mmWalletHint.slice(-4)}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-5">
              <OutlinedButton onClick={checkWalletThenLoad}>Kiểm tra lại</OutlinedButton>
            </div>
            <p className="text-xs text-muted mt-4">
              Gợi ý: hãy mở MetaMask, chuyển đúng tài khoản ví , rồi tải lại trang.
            </p>
          </div>
        ) : walletChecking || loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Welcome Banner */}
            <div className="glass-card p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
              <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-accent/5 rounded-full blur-[60px] pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-muted text-sm font-medium uppercase tracking-widest mb-1">{getTimeGreeting()}</p>
                  <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
                    {firstName} <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">👋</span>
                  </h1>
                  <p className="text-muted mt-2 text-sm max-w-md">
                    Chào mừng bạn quay lại ChainVote — cổng bỏ phiếu blockchain an toàn. Phiếu bầu được bảo vệ và có thể đối soát.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="glass-card px-5 py-4 text-center min-w-[100px]">
                    <p className="text-3xl font-display font-bold text-primary">{totalActive}</p>
                    <p className="text-xs text-muted mt-1">Chưa<br/>bỏ phiếu</p>
                  </div>
                  <div className="glass-card px-5 py-4 text-center min-w-[100px]">
                    <p className="text-3xl font-display font-bold text-success">{totalDone}</p>
                    <p className="text-xs text-muted mt-1">Đã<br/>bỏ phiếu</p>
                  </div>
                  <div className="glass-card px-5 py-4 text-center min-w-[100px]">
                    <p className="text-3xl font-display font-bold text-accent">{elections.length}</p>
                    <p className="text-xs text-muted mt-1">Tổng<br/>cuộc bầu cử</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Security info strip */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: "🔐", label: "Mã hoá SHA-256" },
                { icon: "⛓️", label: "Bất biến trên blockchain" },
                { icon: "🔍", label: "Dễ dàng đối soát" },
                { icon: "🏛️", label: "Kiến trúc permissioned" },
              ].map((tag) => (
                <div
                  key={tag.label}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border/50 rounded-full text-xs text-muted"
                >
                  <span>{tag.icon}</span>
                  <span>{tag.label}</span>
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 min-w-0">
                <Elections elections={elections} onchainStatusByElection={onchainStatusByElection} />
              </div>
              <Wallet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
