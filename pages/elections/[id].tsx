import React, { useEffect, useState } from "react";
import { GetElectionCandidates, GetVoterByID } from "../../lib/api";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { authState } from "../../atoms";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import Navbar from "../../components/layout/Navbar";
import Wallet from "../../features/wallet/components/WalletPanel";
import Candidates from "../../features/elections/components/CandidatesList";
import Spinner from "../../components/ui/Spinner";
import { GetVoterWallet } from "../../lib/api";
import { OutlinedButton } from "../../components/ui/Button";
import {
  ensureMatchingWalletAutoFix,
  getConnectedMetaMaskAddress,
} from "../../lib/walletGuard";

const electionMeta: Record<string, { name: string; description: string; date: string; category: string }> = {
  "dev-election-1": {
    name: "Hội đồng sinh viên 2026",
    description: "Bầu Chủ tịch Hội đồng sinh viên cho một năm học đổi mới, sáng tạo và đặt sinh viên làm trung tâm.",
    date: "15/04 – 20/04/2026",
    category: "Student Government",
  },
  "dev-election-2": {
    name: "Ban tổ chức TechFest",
    description: "Bầu chọn các thành viên ban tổ chức cho TechFest 2027 — lễ hội công nghệ thường niên.",
    date: "12/04 – 18/04/2026",
    category: "Campus Events",
  },
  "election-2026-sc": {
    name: "Hội đồng sinh viên 2026",
    description: "Bầu Chủ tịch Hội đồng sinh viên cho một năm học đổi mới, sáng tạo và đặt sinh viên làm trung tâm.",
    date: "15/04 – 20/04/2026",
    category: "Student Government",
  },
  "election-2026-tech": {
    name: "Ban tổ chức TechFest",
    description: "Bầu chọn các thành viên ban tổ chức cho TechFest 2027.",
    date: "12/04 – 18/04/2026",
    category: "Campus Events",
  },
};

const ElectionPage = () => {
  const router = useRouter();
  const auth = useRecoilValue(authState);
  const setAuth = useSetRecoilState(authState);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [walletBlocked, setWalletBlocked] = useState<{ message: string } | null>(null);
  const [walletChecking, setWalletChecking] = useState(true);
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [blockReason, setBlockReason] = useState<string>("");
  const [linkedWalletHint, setLinkedWalletHint] = useState<string>("");
  const [mmWalletHint, setMmWalletHint] = useState<string>("");
  const idParam = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const meta = electionMeta[idParam || ""] || null;

  const getData = async () => {
    const token = auth?.token;
    try {
      if (!idParam) return;
      setLoading(true);
      const [data, me, statusRes] = await Promise.all([
        GetElectionCandidates(token, idParam, auth?.locationId),
        GetVoterByID(token),
        fetch(`/api/eth/voting-status?electionId=${encodeURIComponent(String(idParam))}`),
      ]);
      const isOpen = statusRes.ok ? !!(await statusRes.json())?.isVotingOpen : false;
      setIsVotingOpen(isOpen);
      const mapping = Array.isArray(me?.elections)
        ? me.elections.find((x: any) => String(x?.election?._id || x?.election?.id || "") === String(idParam))
        : null;
      const voted = String(mapping?.status || "") === "complete";
      setAlreadyVoted(voted);
      if (voted) setBlockReason("Bạn đã bỏ phiếu ở cuộc bầu cử này.");
      else if (!isOpen) setBlockReason("Admin chưa Start voting. Hiện chưa thể bỏ phiếu.");
      else setBlockReason("");
      setCandidates(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Không thể tải dữ liệu cuộc bầu cử.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth?.isLoggedIn) {
      router.push("/");
      return;
    }
    (async () => {
      try {
        setWalletBlocked(null);
        setWalletChecking(true);
        const linkedRes = await GetVoterWallet(auth.token);
        const linked = (linkedRes?.wallet?.public_key || "").toLowerCase();
        setLinkedWalletHint(linked);
        try {
          const mm = await getConnectedMetaMaskAddress();
          setMmWalletHint(mm || "");
        } catch {
          setMmWalletHint("");
        }
        const getLinkedWalletCached = async () => linkedRes;
        await ensureMatchingWalletAutoFix({ token: auth.token, getLinkedWallet: getLinkedWalletCached, attempts: 1 });
        getData();
      } catch (e: any) {
        setWalletBlocked({ message: e?.message || "Không thể xác thực ví MetaMask." });
      } finally {
        setWalletChecking(false);
      }
    })();
  }, [auth?.isLoggedIn, router.isReady, router.query.id]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {walletBlocked ? (
          <div className="glass-card p-6 md:p-8 mt-6">
            <h2 className="text-xl font-display font-bold text-white">Cần đúng ví MetaMask để vào cuộc bầu cử</h2>
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
              <OutlinedButton onClick={() => location.reload()}>Kiểm tra lại</OutlinedButton>
            </div>
            <p className="text-xs text-muted mt-4">
              Gợi ý: hãy mở MetaMask, chuyển đúng tài khoản ví (đúng đuôi như “Ví đã liên kết”), rồi tải lại trang.
            </p>
          </div>
        ) : walletChecking || loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted">
              <button onClick={() => router.push("/dashboard")} className="hover:text-white transition-colors">Bảng điều khiển</button>
              <span>/</span>
              <span className="text-white">{meta?.name || "Cuộc bầu cử"}</span>
            </div>

            {/* Election header */}
            {meta && (
              <div className="glass-card p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-3xl flex-shrink-0">
                    {meta.category === "Student Government" ? "🏛️" : "🎉"}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h1 className="text-2xl md:text-3xl font-display font-bold text-white">{meta.name}</h1>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                        isVotingOpen
                          ? "bg-success/10 border border-success/20 text-success"
                          : "bg-muted/10 border border-border/40 text-muted"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isVotingOpen ? "bg-success animate-pulse" : "bg-muted"}`} />
                        {isVotingOpen ? "Đang mở bỏ phiếu" : "Chưa mở bỏ phiếu"}
                      </span>
                    </div>
                    <p className="text-muted text-sm leading-relaxed max-w-2xl">{meta.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {meta.date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                        {meta.category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main layout */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1 min-w-0">
                <Candidates
                  candidates={candidates}
                  electionName={meta?.name}
                  canVote={isVotingOpen && !alreadyVoted}
                  blockReason={blockReason}
                  authToken={auth?.token}
                />
              </div>
              <Wallet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ElectionPage;
