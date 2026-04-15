import { useRouter } from "next/router";
import CandidateCard, { Candidate } from "./CandidateCard";
import { useState } from "react";
import Modal from "./Modal";
import Button, { OutlinedButton } from "./Button";
import { useRecoilState } from "recoil";
import { WalletState } from "../atoms";
import { toast } from "react-hot-toast";
import Spinner from "./Spinner";
import { ethers } from "ethers";
import { ensureMetaMaskChainMatchesArtifact } from "../lib/evmMetaMask";

interface Props {
  candidates: Candidate[];
  electionName?: string;
  canVote?: boolean;
  blockReason?: string;
  authToken?: string;
}

const Candidates: React.FC<Props> = ({ candidates, electionName, canVote = true, blockReason, authToken }) => {
  const [currentCandidate, setCurrentCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [wallet, setWallet] = useRecoilState(WalletState);

  const [modalOpen, setModalOpen] = useState(false);
  const [noTokenModal, setNoTokenModal] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [transactionKey, setTransactionKey] = useState("");

  const phaseLabel = (p: number) =>
    p === 0 ? "Chuẩn bị" : p === 1 ? "Đang bỏ phiếu" : p === 2 ? "Đã đóng" : "Unknown";

  const getOnchainCandidateId = (candidate: Candidate): bigint => {
    const key = candidate?._id || candidate?.id;
    const idx = candidates.findIndex((c) => (c?._id || c?.id) === key);
    if (idx < 0) throw new Error("Không tìm thấy ứng viên trong danh sách.");
    // Phải khớp thứ tự khi admin addCandidate on-chain (1-based).
    return BigInt(idx + 1);
  };

  const handleVoteConfirm = (candidate: Candidate) => {
    if (!canVote) {
      toast.error(blockReason || "Hiện chưa thể bỏ phiếu cho cuộc bầu cử này.");
      return;
    }
    if (wallet?.tokens <= 0) {
      setNoTokenModal(true);
    } else {
      setCurrentCandidate(candidate);
      setModalOpen(true);
    }
  };

  const confirmVote = async () => {
    try {
      setLoading(true);
      const { id } = router.query;
      const electionId = Array.isArray(id) ? id[0] : id;
      const candidateId = currentCandidate?._id || currentCandidate?.id;

      if (!electionId || !candidateId) throw new Error("Thiếu thông tin cuộc bầu cử / ứng viên.");
      const electionKey = ethers.id(electionId);

      if (typeof window === "undefined") throw new Error("Client only");
      const eth = (window as any).ethereum;
      if (!eth) {
        toast.error("Không phát hiện MetaMask. Vui lòng cài/bật MetaMask.");
        return;
      }

      const metaRes = await fetch("/api/eth/advanced-election");
      const meta = await metaRes.json();
      if (!metaRes.ok) throw new Error(meta?.message || "Không tải được thông tin hợp đồng.");

      await ensureMetaMaskChainMatchesArtifact(eth, meta.networkId);
      const provider = new ethers.BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const code = await provider.getCode(meta.address);
      if (!code || code === "0x") {
        throw new Error(
          `Không có bytecode tại ${meta.address} (đúng chain ${meta.networkId}). Ganache có thể vừa reset — chạy: cd ethereum && npx truffle migrate --reset. Hoặc đổi ETH_NETWORK_ID trong .env.local cho khớp mạng Ganache của bạn.`
        );
      }
      const signer = await provider.getSigner();
      const account = await signer.getAddress();

      const contract = new ethers.Contract(meta.address, meta.abi, signer);
      const electionRaw = await contract.getElection(electionKey);
      const exists = Boolean(electionRaw?.[0]);
      if (!exists) throw new Error("Cuộc bầu cử chưa được khởi tạo on-chain. Vào Admin > On-chain để Init election trước.");
      const phaseRaw = electionRaw?.[2];
      const phase = Number(phaseRaw);
      if (phase !== 1) {
        throw new Error(
          `Hợp đồng đang ở ${phaseLabel(phase)}, chưa mở bỏ phiếu. Vào Admin > On-chain: add candidate (phase Chuẩn bị), rồi Start voting.`
        );
      }
      const votedOnChain = await contract.hasVotedIn(electionKey, account);
      if (votedOnChain) throw new Error("Ví này đã bỏ phiếu on-chain cho cuộc bầu cử này.");

      const onchainCandidateId = getOnchainCandidateId(currentCandidate);
      const tx = await contract.vote(electionKey, onchainCandidateId);
      const receipt = await tx.wait();

      const txHash: string = receipt?.hash || tx?.hash || "";
      if (authToken) {
        const recordRes = await fetch("/api/voter/record-onchain-vote", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ electionId, candidateId, txHash }),
        });
        if (!recordRes.ok) {
          const rj = await recordRes.json().catch(() => ({}));
          throw new Error(rj?.message || "Đã gửi vote on-chain nhưng không thể ghi nhận trạng thái bỏ phiếu.");
        }
      }

      setWallet((w) => ({ ...w, tokens: Math.max(0, w.tokens - 1) }));
      setCurrentCandidate(null);
      setTransactionKey(txHash || "Đã gửi (không lấy được hash)");
      setModalOpen(false);
      setSuccessModal(true);

      toast.success("Đã gửi phiếu lên blockchain.", {
        style: { background: "#111", color: "#00E676" },
      });
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Bỏ phiếu thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã sao chép!", {
      style: { background: "#111", color: "#fff" },
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">
            {electionName || "Danh sách ứng viên"}
          </h2>
          <p className="text-sm text-muted mt-1">
            {candidates.length} ứng viên — hãy cân nhắc vì phiếu bầu là vĩnh viễn
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
          <span className="text-xs font-medium text-primary">Sẵn sàng bỏ phiếu</span>
        </div>
      </div>
      {!canVote && (
        <div className="glass-card p-3 border border-primary/30 bg-primary/10 text-primary text-sm">
          {blockReason || "Bạn chưa thể bỏ phiếu cho cuộc bầu cử này."}
        </div>
      )}

      {candidates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate?.id}
              candidate={candidate}
              onClick={() => handleVoteConfirm(candidate)}
            />
          ))}
        </div>
      ) : (
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">📋</p>
          <p className="font-display font-semibold text-white text-lg">
            Chưa có ứng viên
          </p>
          <p className="text-sm text-muted">
            Cuộc bầu cử này chưa có ứng viên.
          </p>
        </div>
      )}

      <div className="glass-card p-4 flex items-start gap-3 border-l border-l-accent/50">
        <div className="text-accent text-xl mt-0.5">⛓️</div>
        <div>
          <p className="text-sm font-semibold text-white">Ghi nhận trên blockchain</p>
          <p className="text-xs text-muted mt-1">
            Một giao dịch <code className="text-primary/90">vote</code> ghi lựa chọn lên chuỗi (không commit–reveal). Ai cũng có thể thấy lựa chọn sớm hơn so với mô hình ẩn cam kết.
          </p>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Xác nhận bỏ phiếu"
      >
        <div className="flex flex-col gap-5">
          <div className="text-center py-4">
            <div className="text-5xl mb-3">🗳️</div>
            <p className="text-muted text-sm">
              Bạn sắp bỏ phiếu (không thể hoàn tác) cho
            </p>
            <p className="text-2xl font-display font-bold text-white mt-2">
              {currentCandidate?.name}
            </p>
            {currentCandidate?.party && (
              <span className="inline-block mt-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs text-primary font-medium">
                {currentCandidate.party}
              </span>
            )}
          </div>
          <div className="bg-error/10 border border-error/20 rounded-xl p-3 text-xs text-error flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Hành động này không thể hoàn tác. Phiếu sẽ được ghi vĩnh viễn.
          </div>
          <div className="flex gap-3 pt-2">
            <OutlinedButton
              onClick={() => setModalOpen(false)}
              className="flex-1"
            >
              Huỷ
            </OutlinedButton>
            <Button onClick={confirmVote} className="flex-1">
              {loading ? <Spinner /> : "Bỏ phiếu"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={noTokenModal}
        onClose={() => setNoTokenModal(false)}
        title="Không còn token"
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-3xl">
            🚫
          </div>
          <div>
            <p className="font-display font-semibold text-white text-lg">
              Đã dùng hết token
            </p>
            <p className="text-sm text-muted mt-2">
              Bạn đã dùng hết token bỏ phiếu.
            </p>
          </div>
          <OutlinedButton
            onClick={() => setNoTokenModal(false)}
            className="w-full mt-2"
          >
            Đã hiểu
          </OutlinedButton>
        </div>
      </Modal>

      <Modal
        isOpen={successModal}
        onClose={() => setSuccessModal(false)}
        title="Đã ghi phiếu lên blockchain"
      >
        <div className="flex flex-col gap-5">
          <div className="text-center py-2">
            <div className="text-5xl mb-3">✅</div>
            <p className="font-display font-bold text-white text-xl">
              Giao dịch thành công
            </p>
            <p className="text-sm text-muted mt-1">
              Bạn có thể dùng Transaction hash bên dưới để kiểm tra trên explorer hoặc trang Validate.
            </p>
          </div>

          <div className="bg-background/60 rounded-xl p-4 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold">
                Transaction hash
              </p>
              <button
                onClick={() => copyToClipboard(transactionKey)}
                className="text-xs text-primary hover:text-accent transition-colors"
              >
                Sao chép
              </button>
            </div>
            <p className="font-mono text-sm text-accent break-all">
              {transactionKey}
            </p>
          </div>

          <div className="flex gap-3">
            <OutlinedButton onClick={() => setSuccessModal(false)} className="flex-1">
              Đóng
            </OutlinedButton>
            <Button
              onClick={() => router.push("/validate")}
              className="flex-1"
            >
              Kiểm tra trên Validate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Candidates;
