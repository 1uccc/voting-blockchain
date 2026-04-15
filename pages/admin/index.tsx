import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/layout/Navbar";
import { useRecoilValue } from "recoil";
import { authState } from "../../atoms";
import { useRouter } from "next/router";
import Spinner from "../../components/ui/Spinner";
import { toast } from "react-hot-toast";
import Input from "../../components/ui/Input";
import Button, { OutlinedButton } from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { ethers } from "ethers";
import { ensureMetaMaskChainMatchesArtifact } from "../../lib/evmMetaMask";

type Overview = {
  elections: any[];
  candidates: any[];
};

export default function AdminPage() {
  const auth = useRecoilValue(authState);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Overview>({ elections: [], candidates: [] });
  const [tab, setTab] = useState<"elections" | "candidates" | "results" | "onchain">("elections");
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const [eModalOpen, setEModalOpen] = useState(false);
  const [eEditing, setEEditing] = useState<any | null>(null);
  const [eForm, setEForm] = useState<any>({
    _id: "",
    name: "",
    description: "",
    date: "",
    endDate: "",
    status: "active",
    category: "",
    totalVoters: 0,
  });

  const [cModalOpen, setCModalOpen] = useState(false);
  const [cEditing, setCEditing] = useState<any | null>(null);
  const [cForm, setCForm] = useState<any>({
    id: "",
    name: "",
    party: "",
    electionId: "",
    active: true,
    manifesto: "",
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | { title: string; desc: string; run: () => Promise<void> }>(null);

  const [chainLoading, setChainLoading] = useState(false);
  const [chainMeta, setChainMeta] = useState<{ address: string; abi: any; networkId?: string } | null>(null);
  const [chainState, setChainState] = useState<{ state: number; admin: string; candidateCount: string; title: string } | null>(null);
  const [onchainElectionId, setOnchainElectionId] = useState<string>("");
  const [onchainCandidateId, setOnchainCandidateId] = useState<string>("");
  const [phaseByElection, setPhaseByElection] = useState<Record<string, { exists: boolean; phase: number }>>({});
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultElectionId, setResultElectionId] = useState<string>("");
  const [resultWallets, setResultWallets] = useState<any[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Không thể tải tổng quan quản trị");
      setData(json);
      await refreshElectionPhases(Array.isArray(json?.elections) ? json.elections : []);
    } catch (e: any) {
      toast.error(e?.message || "Không thể tải dữ liệu quản trị");
    } finally {
      setLoading(false);
    }
  };

  const authHeader = useMemo(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    if (!auth?.isLoggedIn) {
      router.push("/");
      return;
    }
    if (auth.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isLoggedIn, auth?.role, auth?.token]);

  useEffect(() => {
    if (!resultElectionId && data.elections?.length) {
      setResultElectionId(String(data.elections[0]?._id || ""));
    }
  }, [data.elections, resultElectionId]);

  useEffect(() => {
    if (!onchainElectionId && data.elections?.length) {
      setOnchainElectionId(String(data.elections[0]?._id || ""));
    }
  }, [data.elections, onchainElectionId]);

  useEffect(() => {
    if (!resultElectionId) return;
    loadResultsForElection(resultElectionId);
  }, [resultElectionId]);

  const elections = useMemo(() => {
    const raw = Array.isArray(data.elections) ? data.elections : [];
    const query = q.trim().toLowerCase();
    return raw
      .filter((e) => {
        const status = String(e?.status || "");
        if (onlyActive && status !== "active" && status !== "incomplete") return false;
        if (!query) return true;
        const hay = `${e?._id || ""} ${e?.name || ""} ${e?.category || ""} ${e?.description || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => String(a?._id || "").localeCompare(String(b?._id || "")));
  }, [data.elections, q, onlyActive]);

  const candidates = useMemo(() => {
    const raw = Array.isArray(data.candidates) ? data.candidates : [];
    const query = q.trim().toLowerCase();
    return raw
      .filter((c) => {
        if (onlyActive && c?.active === false) return false;
        if (!query) return true;
        const hay = `${c?.id || ""} ${c?._id || ""} ${c?.name || ""} ${c?.party || ""} ${c?.electionId || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => String(a?.electionId || "").localeCompare(String(b?.electionId || "")));
  }, [data.candidates, q, onlyActive]);

  const phaseSummary = useMemo(() => {
    let notStarted = 0;
    let voting = 0;
    let done = 0;
    for (const e of elections) {
      const st = phaseByElection[String(e?._id || "")];
      if (!st || !st.exists || st.phase === 0) notStarted++;
      else if (st.phase === 1) voting++;
      else if (st.phase === 2) done++;
    }
    return { notStarted, voting, done };
  }, [elections, phaseByElection]);

  const getOnchainPhaseLabel = (electionId: string): string => {
    const st = phaseByElection[electionId];
    if (!st || !st.exists) return "Chưa khởi tạo";
    if (st.phase === 0) return "Chưa bắt đầu";
    if (st.phase === 1) return "Đang bầu cử";
    if (st.phase === 2) return "Hoàn thành";
    return "Không xác định";
  };

  const getOnchainPhaseStyle = (electionId: string): string => {
    const st = phaseByElection[electionId];
    if (!st || !st.exists) return "bg-muted/10 text-muted border-border/40";
    if (st.phase === 1) return "bg-success/10 text-success border-success/20";
    if (st.phase === 2) return "bg-primary/10 text-primary border-primary/20";
    return "bg-accent/10 text-accent border-accent/20";
  };

  const refreshElectionPhases = async (rows: any[]) => {
    const ids = (rows || []).map((e: any) => String(e?._id || "")).filter(Boolean);
    if (!ids.length) {
      setPhaseByElection({});
      return;
    }
    const statuses = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`/api/eth/voting-status?electionId=${encodeURIComponent(id)}`);
          const j = await r.json();
          if (!r.ok) return [id, { exists: false, phase: 0 }] as const;
          return [id, { exists: !!j?.exists, phase: Number(j?.phase || 0) }] as const;
        } catch {
          return [id, { exists: false, phase: 0 }] as const;
        }
      })
    );
    setPhaseByElection(Object.fromEntries(statuses));
  };

  const loadResultsForElection = async (electionId: string) => {
    if (!electionId) return;
    try {
      setResultsLoading(true);
      const res = await fetch(`/api/candidate-wallets?electionId=${encodeURIComponent(electionId)}`);
      const json = await res.json();
      setResultWallets(Array.isArray(json?.wallets) ? json.wallets : []);
    } catch {
      toast.error("Không thể tải kết quả bầu cử", { style: { background: "#222", color: "#FF1A1A" } });
    } finally {
      setResultsLoading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép", { style: { background: "#111", color: "#00E676" } });
    } catch {
      toast.error("Không thể sao chép", { style: { background: "#222", color: "#FF1A1A" } });
    }
  };

  const openElectionCreate = () => {
    setEEditing(null);
    setEForm({
      _id: "",
      name: "",
      description: "",
      date: "",
      endDate: "",
      status: "active",
      category: "",
      totalVoters: 0,
    });
    setEModalOpen(true);
  };

  const openElectionEdit = (e: any) => {
    setEEditing(e);
    setEForm({
      _id: String(e?._id || ""),
      name: String(e?.name || ""),
      description: String(e?.description || ""),
      date: String(e?.date || ""),
      endDate: String(e?.endDate || ""),
      status: String(e?.status || "active"),
      category: String(e?.category || ""),
      totalVoters: Number(e?.totalVoters || 0),
    });
    setEModalOpen(true);
  };

  const saveElection = async () => {
    const isEdit = !!eEditing;
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch("/api/admin/elections", {
      method,
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(eForm),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể lưu cuộc bầu cử");
    toast.success(isEdit ? "Đã cập nhật cuộc bầu cử" : "Đã tạo cuộc bầu cử", { style: { background: "#111", color: "#00E676" } });
    setEModalOpen(false);
    await load();
  };

  const deleteElection = async (_id: string) => {
    const res = await fetch("/api/admin/elections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ _id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể xoá cuộc bầu cử");
    toast.success("Đã xoá cuộc bầu cử", { style: { background: "#111", color: "#00E676" } });
    await load();
  };

  const openCandidateCreate = () => {
    setCEditing(null);
    setCForm({
      id: "",
      name: "",
      party: "",
      electionId: "",
      active: true,
      manifesto: "",
    });
    setCModalOpen(true);
  };

  const openCandidateEdit = (c: any) => {
    setCEditing(c);
    setCForm({
      id: String(c?.id || c?._id || ""),
      name: String(c?.name || ""),
      party: String(c?.party || ""),
      electionId: String(c?.electionId || ""),
      active: c?.active === false ? false : true,
      manifesto: String(c?.manifesto || ""),
    });
    setCModalOpen(true);
  };

  const saveCandidate = async () => {
    const isEdit = !!cEditing;
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch("/api/admin/candidates", {
      method,
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(cForm),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể lưu ứng viên");
    toast.success(isEdit ? "Đã cập nhật ứng viên" : "Đã tạo ứng viên", { style: { background: "#111", color: "#00E676" } });
    setCModalOpen(false);
    await load();
  };

  const deleteCandidate = async (id: string) => {
    const res = await fetch("/api/admin/candidates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể xoá ứng viên");
    toast.success("Đã xoá ứng viên", { style: { background: "#111", color: "#00E676" } });
    await load();
  };

  const toggleCandidateActive = async (c: any) => {
    const res = await fetch("/api/admin/candidates", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ ...c, id: c?.id || c?._id, active: !(c?.active !== false) }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể cập nhật trạng thái ứng viên");
    await load();
  };

  // ---- On-chain admin (demo single contract) ----
  const loadChainMeta = async () => {
    const res = await fetch("/api/eth/advanced-election");
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Không thể tải thông tin hợp đồng on-chain");
    setChainMeta({ address: json.address, abi: json.abi, networkId: json.networkId });
    return { address: json.address, abi: json.abi, networkId: json.networkId as string | undefined };
  };

  const readChainState = async (meta?: { address: string; abi: any; networkId?: string }, electionIdArg?: string) => {
    const m = meta || chainMeta || (await loadChainMeta());
    const electionId = electionIdArg || onchainElectionId;
    if (!electionId) throw new Error("Chưa chọn cuộc bầu cử on-chain.");
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("Cần cài MetaMask để thao tác on-chain.");
    await ensureMetaMaskChainMatchesArtifact(eth, m.networkId);
    const provider = new ethers.BrowserProvider(eth);
    const code = await provider.getCode(m.address);
    if (!code || code === "0x") {
      throw new Error(
        `Không có bytecode tại ${m.address} (cần chain ${m.networkId}). Ganache reset? Chạy: cd ethereum && npx truffle migrate --reset. Kiểm tra MetaMask RPC = Ganache (thường http://127.0.0.1:7545).`
      );
    }
    const contract = new ethers.Contract(m.address, m.abi, provider);
    const electionKey = ethers.id(electionId);
    const [adminAddr, electionInfo] = await Promise.all([contract.electionAdmin(), contract.getElection(electionKey)]);
    const exists = Boolean(electionInfo?.[0]);
    const title = exists ? String(electionInfo?.[1] || electionId) : `${electionId} (chưa init)`;
    const phase = exists ? Number(electionInfo?.[2] || 0) : 0;
    const candidateCount = exists ? String(electionInfo?.[3] || 0) : "0";
    setChainState({
      state: phase,
      admin: String(adminAddr),
      candidateCount,
      title,
    });
  };

  const runChainTx = async (fn: (contract: any) => Promise<any>) => {
    const m = chainMeta || (await loadChainMeta());
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("Cần cài MetaMask để thao tác on-chain.");
    await ensureMetaMaskChainMatchesArtifact(eth, m.networkId);
    const provider = new ethers.BrowserProvider(eth);
    const code = await provider.getCode(m.address);
    if (!code || code === "0x") {
      throw new Error(
        `Không có bytecode tại ${m.address} (chain ${m.networkId}). Chạy: cd ethereum && npx truffle migrate --reset.`
      );
    }
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(m.address, m.abi, signer);
    const tx = await fn(contract);
    await tx.wait();
    await readChainState(m);
  };

  const stateLabel = (s?: number) => {
    const n = typeof s === "number" ? s : -1;
    // SimpleElection.Phase: Setup, Voting, Closed
    return n === 0 ? "Chuẩn bị" : n === 1 ? "Đang bỏ phiếu" : n === 2 ? "Đã đóng" : "–";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="glass-card p-6">
              <h1 className="text-3xl font-display font-bold text-white">
                Bảng điều khiển quản trị
              </h1>
              <p className="text-sm text-muted mt-2">
                Bạn đang đăng nhập với vai trò <b>admin</b>.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Cuộc bầu cử", value: data.elections.length },
                { label: "Ứng viên", value: data.candidates.length },
              ].map((s) => (
                <div key={s.label} className="glass-card p-4 text-center">
                  <p className="text-2xl font-display font-bold text-white">
                    {s.value}
                  </p>
                  <p className="text-xs text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="glass-card p-4 md:p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <Input
                    label="Tìm kiếm"
                    type="text"
                    placeholder="Tìm theo tên, mã, mô tả, category..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setOnlyActive((v) => !v)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all ${
                      onlyActive
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-surface/50 border-border/60 text-muted hover:text-white hover:border-primary/40"
                    }`}
                    title="Chỉ hiển thị mục đang hoạt động"
                  >
                    {onlyActive ? "Đang bật lọc" : "Lọc"}
                  </button>
                  <OutlinedButton onClick={load} className="px-4 py-3 text-sm">
                    Làm mới
                  </OutlinedButton>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setTab("elections")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    tab === "elections"
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-surface/50 border-border/60 text-muted hover:text-white hover:border-primary/30"
                  }`}
                >
                  Cuộc bầu cử
                </button>
                <button
                  onClick={() => setTab("candidates")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    tab === "candidates"
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-surface/50 border-border/60 text-muted hover:text-white hover:border-primary/30"
                  }`}
                >
                  Ứng viên
                </button>
                <button
                  onClick={() => setTab("onchain")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    tab === "onchain"
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-surface/50 border-border/60 text-muted hover:text-white hover:border-primary/30"
                  }`}
                >
                  On-chain
                </button>
                <button
                  onClick={() => setTab("results")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    tab === "results"
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-surface/50 border-border/60 text-muted hover:text-white hover:border-primary/30"
                  }`}
                >
                  Kết quả
                </button>
              </div>
            </div>

            {tab === "elections" ? (
              <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <p className="text-xs text-muted uppercase tracking-wider font-semibold">Chưa bầu cử</p>
                  <p className="text-2xl font-display font-bold text-accent mt-1">{phaseSummary.notStarted}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs text-muted uppercase tracking-wider font-semibold">Đang bầu cử</p>
                  <p className="text-2xl font-display font-bold text-success mt-1">{phaseSummary.voting}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs text-muted uppercase tracking-wider font-semibold">Hoàn thành</p>
                  <p className="text-2xl font-display font-bold text-primary mt-1">{phaseSummary.done}</p>
                </div>
              </div>
              <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                  <h2 className="font-display font-semibold text-white">Danh sách cuộc bầu cử</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{elections.length} mục</span>
                    <Button onClick={openElectionCreate} className="px-4 py-2 text-sm">Tạo</Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted uppercase tracking-wider">
                      <tr className="border-b border-border/40">
                        <th className="text-left px-6 py-3">Tên</th>
                        <th className="text-left px-6 py-3">Mã</th>
                        <th className="text-left px-6 py-3">Trạng thái (Firestore)</th>
                        <th className="text-left px-6 py-3">Trạng thái bầu cử (On-chain)</th>
                        <th className="text-left px-6 py-3">Ngày</th>
                        <th className="text-left px-6 py-3">Category</th>
                        <th className="text-right px-6 py-3">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {elections.length === 0 ? (
                        <tr>
                          <td className="px-6 py-10 text-center text-muted" colSpan={7}>
                            Không có dữ liệu phù hợp bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        elections.map((e: any) => {
                          const status = String(e?.status || "–");
                          const statusLabel =
                            status === "active"
                              ? "Đang mở"
                              : status === "upcoming"
                                ? "Sắp diễn ra"
                                : status === "closed"
                                  ? "Đã đóng"
                                  : status;
                          const statusStyle =
                            status === "active"
                              ? "bg-success/10 text-success border-success/20"
                              : status === "upcoming"
                                ? "bg-accent/10 text-accent border-accent/20"
                                : "bg-muted/10 text-muted border-border/40";
                          const dateText = e?.date ? new Date(e.date).toLocaleDateString("vi-VN") : "–";
                          return (
                            <tr key={e?._id} className="hover:bg-primary/5 transition-colors">
                              <td className="px-6 py-4">
                                <p className="text-white font-semibold">{e?.name || "–"}</p>
                                {e?.description ? (
                                  <p className="text-xs text-muted mt-1 line-clamp-1">{e.description}</p>
                                ) : null}
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-white/90 font-mono">{e?._id || "–"}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${statusStyle}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${getOnchainPhaseStyle(String(e?._id || ""))}`}>
                                  {getOnchainPhaseLabel(String(e?._id || ""))}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-white/90">{dateText}</td>
                              <td className="px-6 py-4 text-white/80">{e?.category || "–"}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => copy(String(e?._id || ""))}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border/60 text-muted hover:text-white hover:border-primary/50 transition-all"
                                  >
                                    Copy mã
                                  </button>
                                  <button
                                    onClick={() => openElectionEdit(e)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border/60 text-muted hover:text-white hover:border-primary/50 transition-all"
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmAction({
                                        title: "Xoá cuộc bầu cử?",
                                        desc: `Bạn sắp xoá: ${e?.name || e?._id}`,
                                        run: async () => deleteElection(String(e?._id || "")),
                                      });
                                      setConfirmOpen(true);
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-error/30 text-error hover:text-white hover:bg-error/20 transition-all"
                                  >
                                    Xoá
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            ) : tab === "candidates" ? (
              <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                  <h2 className="font-display font-semibold text-white">Danh sách ứng viên</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{candidates.length} mục</span>
                    <Button onClick={openCandidateCreate} className="px-4 py-2 text-sm">Tạo</Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted uppercase tracking-wider">
                      <tr className="border-b border-border/40">
                        <th className="text-left px-6 py-3">Ứng viên</th>
                        <th className="text-left px-6 py-3">Cuộc bầu cử</th>
                        <th className="text-left px-6 py-3">Trạng thái</th>
                        <th className="text-left px-6 py-3">ID</th>
                        <th className="text-right px-6 py-3">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {candidates.length === 0 ? (
                        <tr>
                          <td className="px-6 py-10 text-center text-muted" colSpan={5}>
                            Không có dữ liệu phù hợp bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        candidates.map((c: any) => {
                          const active = c?.active !== false;
                          return (
                            <tr key={c?.id || c?._id} className="hover:bg-primary/5 transition-colors">
                              <td className="px-6 py-4">
                                <p className="text-white font-semibold">{c?.name || "–"}</p>
                                {c?.party ? <p className="text-xs text-muted mt-1">{c.party}</p> : null}
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-white/90 font-mono">{c?.electionId || "–"}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${
                                    active
                                      ? "bg-success/10 text-success border-success/20"
                                      : "bg-muted/10 text-muted border-border/40"
                                  }`}
                                >
                                  {active ? "Đang hoạt động" : "Tắt"}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-white/90 font-mono">{c?.id || c?._id || "–"}</p>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => copy(String(c?.id || c?._id || ""))}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border/60 text-muted hover:text-white hover:border-primary/50 transition-all"
                                  >
                                    Copy ID
                                  </button>
                                  <button
                                    onClick={() => toggleCandidateActive(c)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                      active
                                        ? "border-success/30 text-success hover:bg-success/10"
                                        : "border-border/60 text-muted hover:text-white hover:border-primary/50"
                                    }`}
                                  >
                                    {active ? "Tắt" : "Bật"}
                                  </button>
                                  <button
                                    onClick={() => openCandidateEdit(c)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border/60 text-muted hover:text-white hover:border-primary/50 transition-all"
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmAction({
                                        title: "Xoá ứng viên?",
                                        desc: `Bạn sắp xoá: ${c?.name || c?.id}`,
                                        run: async () => deleteCandidate(String(c?.id || c?._id || "")),
                                      });
                                      setConfirmOpen(true);
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-error/30 text-error hover:text-white hover:bg-error/20 transition-all"
                                  >
                                    Xoá
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "results" && (
              <div className="glass-card p-6 flex flex-col gap-5">
                <div className="flex items-end gap-3 flex-col md:flex-row">
                  <div className="flex-1 w-full">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-2">Chọn cuộc bầu cử</p>
                    <select
                      value={resultElectionId}
                      onChange={(e) => setResultElectionId(e.target.value)}
                      className="w-full bg-background/60 border border-border/40 rounded-xl px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="">—</option>
                      {elections.map((e: any) => (
                        <option key={e?._id} value={e?._id}>
                          {e?.name} ({e?._id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <OutlinedButton
                    onClick={() => loadResultsForElection(resultElectionId)}
                    className="px-4 py-3 text-sm"
                  >
                    Làm mới kết quả
                  </OutlinedButton>
                </div>

                {resultsLoading ? (
                  <div className="flex items-center justify-center min-h-[240px]">
                    <Spinner />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const sorted = [...resultWallets].sort((a: any, b: any) => Number(b?.tokens || 0) - Number(a?.tokens || 0));
                      const totalVotes = sorted.reduce((sum: number, c: any) => sum + Number(c?.tokens || 0), 0);
                      const leader = sorted[0];
                      const getPercent = (votes: number) => (totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0);
                      return (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40 text-center">
                              <p className="text-xs text-muted uppercase tracking-wider">Tổng phiếu</p>
                              <p className="text-2xl font-display font-bold text-white mt-1">{totalVotes}</p>
                            </div>
                            <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40 text-center">
                              <p className="text-xs text-muted uppercase tracking-wider">Ứng viên</p>
                              <p className="text-2xl font-display font-bold text-white mt-1">{sorted.length}</p>
                            </div>
                            <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40 text-center">
                              <p className="text-xs text-muted uppercase tracking-wider">Dẫn đầu</p>
                              <p className="text-lg font-display font-bold text-yellow-400 mt-1">{leader?.name || "–"}</p>
                            </div>
                            <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40 text-center">
                              <p className="text-xs text-muted uppercase tracking-wider">Tỷ lệ</p>
                              <p className="text-2xl font-display font-bold text-accent mt-1">
                                {leader ? `${getPercent(Number(leader?.tokens || 0))}%` : "0%"}
                              </p>
                            </div>
                          </div>

                          <div className="glass-card overflow-hidden border border-border/40">
                            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                              <h2 className="font-display font-semibold text-white">Kết quả theo ứng viên</h2>
                              <span className="text-xs text-muted">{totalVotes} phiếu</span>
                            </div>
                            {sorted.length === 0 ? (
                              <div className="p-16 text-center text-muted">Chưa có dữ liệu kết quả cho cuộc bầu cử này.</div>
                            ) : (
                              <div className="divide-y divide-border/40">
                                {sorted.map((candidate: any, idx: number) => {
                                  const percent = getPercent(Number(candidate?.tokens || 0));
                                  return (
                                    <div key={`${candidate?.public_key || candidate?.name || idx}`} className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                      <div className="flex-1">
                                        <p className="font-semibold text-white">{candidate?.name || "–"}</p>
                                        <p className="text-xs text-muted mt-1">{candidate?.party || "–"}</p>
                                      </div>
                                      <div className="w-full sm:max-w-xs">
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="text-xs text-muted">{percent}% số phiếu</span>
                                          <span className="text-sm font-bold text-white">{candidate?.tokens || 0} phiếu</span>
                                        </div>
                                        <div className="h-2.5 bg-border/40 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${idx === 0 ? "bg-gradient-to-r from-yellow-400 to-amber-500" : "bg-gradient-to-r from-primary to-accent"}`}
                                            style={{ width: `${percent}%` }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {tab === "onchain" && (
              <div className="glass-card p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-semibold text-white">Điều khiển hợp đồng on-chain (demo)</h2>
                    <p className="text-xs text-muted mt-1">
                      Hợp đồng `MultiElection`: mỗi cuộc bầu cử có phase/candidate/vote riêng theo `electionId` (hash thành key on-chain).
                    </p>
                  </div>
                  <OutlinedButton
                    onClick={async () => {
                      try {
                        setChainLoading(true);
                        const meta = await loadChainMeta();
                        await readChainState(meta);
                        toast.success("Đã tải trạng thái on-chain", { style: { background: "#111", color: "#00E676" } });
                      } catch (e: any) {
                        toast.error(e?.message || "Không thể tải trạng thái on-chain", { style: { background: "#222", color: "#FF1A1A" } });
                      } finally {
                        setChainLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    {chainLoading ? "Đang tải..." : "Tải trạng thái"}
                  </OutlinedButton>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Địa chỉ contract</p>
                    <p className="text-sm text-white font-mono break-all">{chainMeta?.address || "–"}</p>
                    {chainMeta?.networkId && (
                      <p className="text-[11px] text-muted mt-1">Artifact network id: {chainMeta.networkId}</p>
                    )}
                  </div>
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Phase (theo election đã chọn)</p>
                    <p className="text-sm text-white font-mono">
                      {chainState ? `${chainState.state} (${stateLabel(chainState.state)})` : "–"}
                    </p>
                  </div>
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Số ứng viên on-chain</p>
                    <p className="text-sm text-white font-mono">{chainState?.candidateCount || "–"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Chọn cuộc bầu cử (để lọc ứng viên)</p>
                    <select
                      value={onchainElectionId}
                      onChange={(e) => setOnchainElectionId(e.target.value)}
                      className="mt-1 w-full bg-transparent outline-none text-sm text-white"
                    >
                      <option value="">—</option>
                      {elections.map((e: any) => (
                        <option key={e._id} value={e._id}>
                          {e.name} ({e._id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-background/60 rounded-xl px-4 py-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Chọn ứng viên để addCandidate on-chain</p>
                    <select
                      value={onchainCandidateId}
                      onChange={(e) => setOnchainCandidateId(e.target.value)}
                      className="mt-1 w-full bg-transparent outline-none text-sm text-white"
                    >
                      <option value="">—</option>
                      {candidates
                        .filter((c: any) => (onchainElectionId ? String(c?.electionId || "") === onchainElectionId : true))
                        .map((c: any) => (
                          <option key={c.id || c._id} value={c.id || c._id}>
                            {c.name} ({c.party || "–"})
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted mt-1">
                      Lưu ý: chỉ add được khi phase = Chuẩn bị (chưa Start voting).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={async () => {
                      try {
                        if (!onchainElectionId) throw new Error("Chưa chọn cuộc bầu cử.");
                        const e = (data.elections || []).find((x: any) => String(x?._id || "") === onchainElectionId);
                        if (!e) throw new Error("Không tìm thấy election trong Firestore.");
                        setChainLoading(true);
                        const electionKey = ethers.id(onchainElectionId);
                        await runChainTx((contract) => contract.createElection(electionKey, String(e.name || onchainElectionId)));
                        toast.success("Đã khởi tạo election on-chain", { style: { background: "#111", color: "#00E676" } });
                      } catch (e: any) {
                        toast.error(e?.shortMessage || e?.message || "Không thể init election on-chain", { style: { background: "#222", color: "#FF1A1A" } });
                      } finally {
                        setChainLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    Init election (on-chain)
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        if (!onchainElectionId) throw new Error("Chưa chọn cuộc bầu cử.");
                        if (!onchainCandidateId) throw new Error("Chưa chọn ứng viên.");
                        const c = (data.candidates || []).find((x: any) => String(x?.id || x?._id) === onchainCandidateId);
                        if (!c) throw new Error("Không tìm thấy ứng viên.");
                        setChainLoading(true);
                        const meta = chainMeta || (await loadChainMeta());
                        const electionKey = ethers.id(onchainElectionId);
                        const eth = (window as any).ethereum;
                        if (!eth) throw new Error("Cần cài MetaMask để thao tác on-chain.");
                        const provider = new ethers.BrowserProvider(eth);
                        await provider.send("eth_requestAccounts", []);
                        const signer = await provider.getSigner();
                        const contractRO = new ethers.Contract(meta.address, meta.abi, provider);
                        const [adminRaw, electionInfo] = await Promise.all([
                          contractRO.electionAdmin(),
                          contractRO.getElection(electionKey),
                        ]);
                        if (!electionInfo?.[0]) throw new Error("Election này chưa init on-chain. Hãy bấm Init election trước.");
                        const phase = Number(electionInfo?.[2] || 0);
                        if (phase !== 0) {
                          throw new Error(`Không thể add candidate khi phase = ${stateLabel(phase)}. Cần phase Chuẩn bị.`);
                        }
                        const current = (await signer.getAddress()).toLowerCase();
                        const admin = String(adminRaw || "").toLowerCase();
                        if (admin && current !== admin) {
                          throw new Error("Bạn đang dùng sai ví admin deploy contract. Hãy chuyển đúng account admin trong MetaMask.");
                        }
                        await runChainTx((contract) =>
                          contract.addCandidate(electionKey, String(c.name || ""), String(c.party || ""))
                        );
                        await readChainState(meta, onchainElectionId);
                        toast.success("Đã addCandidate on-chain", { style: { background: "#111", color: "#00E676" } });
                      } catch (e: any) {
                        toast.error(e?.shortMessage || e?.message || "Thao tác on-chain thất bại", { style: { background: "#222", color: "#FF1A1A" } });
                      } finally {
                        setChainLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    Add Candidate (on-chain)
                  </Button>

                  <OutlinedButton
                    onClick={async () => {
                      try {
                        if (!onchainElectionId) throw new Error("Chưa chọn cuộc bầu cử.");
                        setChainLoading(true);
                        const electionKey = ethers.id(onchainElectionId);
                        await runChainTx((contract) => contract.startVoting(electionKey));
                        toast.success("Đã mở bỏ phiếu (on-chain)", { style: { background: "#111", color: "#00E676" } });
                      } catch (e: any) {
                        toast.error(e?.shortMessage || e?.message || "Thao tác thất bại", { style: { background: "#222", color: "#FF1A1A" } });
                      } finally {
                        setChainLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    Start voting
                  </OutlinedButton>
                  <OutlinedButton
                    onClick={async () => {
                      try {
                        if (!onchainElectionId) throw new Error("Chưa chọn cuộc bầu cử.");
                        setChainLoading(true);
                        const electionKey = ethers.id(onchainElectionId);
                        await runChainTx((contract) => contract.closeVoting(electionKey));
                        toast.success("Đã đóng bỏ phiếu (on-chain)", { style: { background: "#111", color: "#00E676" } });
                      } catch (e: any) {
                        toast.error(e?.shortMessage || e?.message || "Thao tác thất bại", { style: { background: "#222", color: "#FF1A1A" } });
                      } finally {
                        setChainLoading(false);
                      }
                    }}
                    className="px-4 py-2 text-sm"
                  >
                    Close voting
                  </OutlinedButton>
                </div>

                <p className="text-xs text-muted">
                  Nếu giao dịch bị từ chối: hãy chắc MetaMask đang chọn đúng account **admin** (account deploy contract).
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Election Modal */}
      <Modal
        isOpen={eModalOpen}
        onClose={() => setEModalOpen(false)}
        title={eEditing ? "Sửa cuộc bầu cử" : "Tạo cuộc bầu cử"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Mã cuộc bầu cử (_id)"
            type="text"
            placeholder="vd: election-2026-sc"
            value={eForm._id}
            onChange={(e) => setEForm((p: any) => ({ ...p, _id: e.target.value }))}
          />
          <Input
            label="Tên"
            type="text"
            placeholder="vd: Hội đồng sinh viên 2026"
            value={eForm.name}
            onChange={(e) => setEForm((p: any) => ({ ...p, name: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-muted mb-1.5 ml-1">Mô tả</label>
            <textarea
              value={eForm.description}
              onChange={(e) => setEForm((p: any) => ({ ...p, description: e.target.value }))}
              className="w-full bg-surface/50 border border-border/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              rows={3}
              placeholder="Mô tả cuộc bầu cử..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Ngày bắt đầu (date)"
              type="text"
              placeholder="YYYY-MM-DD"
              value={eForm.date}
              onChange={(e) => setEForm((p: any) => ({ ...p, date: e.target.value }))}
            />
            <Input
              label="Ngày kết thúc (endDate)"
              type="text"
              placeholder="YYYY-MM-DD"
              value={eForm.endDate}
              onChange={(e) => setEForm((p: any) => ({ ...p, endDate: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col w-full relative">
              <label className="text-sm font-medium text-muted mb-1.5 ml-1">Trạng thái</label>
              <select
                value={eForm.status}
                onChange={(e) => setEForm((p: any) => ({ ...p, status: e.target.value }))}
                className="w-full bg-surface/50 border border-border/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              >
                <option value="active">active</option>
                <option value="upcoming">upcoming</option>
                <option value="closed">closed</option>
              </select>
            </div>
            <Input
              label="Category"
              type="text"
              placeholder="vd: Student Government"
              value={eForm.category}
              onChange={(e) => setEForm((p: any) => ({ ...p, category: e.target.value }))}
            />
          </div>
          <Input
            label="Tổng cử tri (totalVoters)"
            type="number"
            placeholder="0"
            value={eForm.totalVoters}
            onChange={(e) => setEForm((p: any) => ({ ...p, totalVoters: Number(e.target.value) }))}
          />
          <div className="flex gap-3 pt-2">
            <OutlinedButton onClick={() => setEModalOpen(false)} className="flex-1">Huỷ</OutlinedButton>
            <Button
              onClick={async () => {
                try {
                  await saveElection();
                } catch (e: any) {
                  toast.error(e?.message || "Không thể lưu", { style: { background: "#222", color: "#FF1A1A" } });
                }
              }}
              className="flex-1"
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Candidate Modal */}
      <Modal
        isOpen={cModalOpen}
        onClose={() => setCModalOpen(false)}
        title={cEditing ? "Sửa ứng viên" : "Tạo ứng viên"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Mã ứng viên (id)"
            type="text"
            placeholder="vd: cand-sc-001"
            value={cForm.id}
            onChange={(e) => setCForm((p: any) => ({ ...p, id: e.target.value }))}
          />
          <Input
            label="Tên"
            type="text"
            placeholder="vd: Nguyễn Văn A"
            value={cForm.name}
            onChange={(e) => setCForm((p: any) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Đảng/nhóm"
            type="text"
            placeholder="vd: Liên minh tiến bộ"
            value={cForm.party}
            onChange={(e) => setCForm((p: any) => ({ ...p, party: e.target.value }))}
          />
          <div className="flex flex-col w-full relative">
            <label className="text-sm font-medium text-muted mb-1.5 ml-1">Cuộc bầu cử (electionId)</label>
            <select
              value={cForm.electionId}
              onChange={(e) => setCForm((p: any) => ({ ...p, electionId: e.target.value }))}
              className="w-full bg-surface/50 border border-border/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
            >
              <option value="">—</option>
              {elections.map((e: any) => (
                <option key={e._id} value={e._id}>
                  {e.name} ({e._id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={cForm.active !== false}
              onChange={(e) => setCForm((p: any) => ({ ...p, active: e.target.checked }))}
            />
            <span className="text-sm text-white">Đang hoạt động</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-muted mb-1.5 ml-1">Chương trình hành động</label>
            <textarea
              value={cForm.manifesto}
              onChange={(e) => setCForm((p: any) => ({ ...p, manifesto: e.target.value }))}
              className="w-full bg-surface/50 border border-border/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              rows={4}
              placeholder="Nội dung..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <OutlinedButton onClick={() => setCModalOpen(false)} className="flex-1">Huỷ</OutlinedButton>
            <Button
              onClick={async () => {
                try {
                  await saveCandidate();
                } catch (e: any) {
                  toast.error(e?.message || "Không thể lưu", { style: { background: "#222", color: "#FF1A1A" } });
                }
              }}
              className="flex-1"
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmAction?.title || "Xác nhận"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{confirmAction?.desc || "Bạn chắc chắn muốn thực hiện thao tác này?"}</p>
          <div className="flex gap-3">
            <OutlinedButton onClick={() => setConfirmOpen(false)} className="flex-1">Huỷ</OutlinedButton>
            <Button
              onClick={async () => {
                try {
                  if (confirmAction?.run) await confirmAction.run();
                  setConfirmOpen(false);
                } catch (e: any) {
                  toast.error(e?.message || "Thao tác thất bại", { style: { background: "#222", color: "#FF1A1A" } });
                }
              }}
              className="flex-1"
            >
              Đồng ý
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

