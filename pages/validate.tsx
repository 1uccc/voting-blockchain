import React, { useState } from "react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { toast } from "react-hot-toast";
import Spinner from "../components/ui/Spinner";
import { VerifyVote } from "../lib/api";
import Modal from "../components/ui/Modal";
import Navbar from "../components/layout/Navbar";
import Link from "next/link";

const Validate = () => {
  const [transactionKey, setTransactionKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const validateVote = async (event: any) => {
    event.preventDefault();
    if (!transactionKey.trim()) {
      toast("Vui lòng nhập mã giao dịch", { style: { background: "#222", color: "#fff" } });
      return;
    }
    try {
      setLoading(true);
      const data = await VerifyVote(transactionKey.trim());
      setResult(data);
      setModalOpen(true);
      if (data?.valid) {
        toast.success("Phiếu đã được xác minh trên blockchain!", { style: { background: "#111", color: "#00E676" } });
      } else {
        toast.error("Không tìm thấy phiếu.", { style: { background: "#222", color: "#FF1A1A" } });
      }
    } catch {
      toast.error("Xác minh thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <div className="max-w-2xl mx-auto flex flex-col gap-8 py-8">
          {/* Header */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-3xl mx-auto mb-4">🔍</div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
              Xác minh <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">phiếu bầu</span>
            </h1>
            <p className="text-muted mt-3 text-sm leading-relaxed max-w-md mx-auto">
              Nhập transaction hash sau khi bỏ phiếu (giao dịch <code className="text-primary/80">vote</code>) để kiểm tra phiếu có tồn tại và hợp lệ trên blockchain.
            </p>
          </div>

          {/* Form */}
          <div className="glass-card p-6 md:p-8 flex flex-col gap-5">
            <form onSubmit={validateVote} className="flex flex-col gap-5">
              <Input
                label="Mã giao dịch (Transaction Key)"
                type="text"
                placeholder="vd: TX-194A7B2F-ABCDEF123456"
                value={transactionKey}
                onChange={(e) => setTransactionKey(e.target.value)}
              />
              <Button onClick={validateVote} className="w-full">
                {loading ? <Spinner /> : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                    Xác minh phiếu trên blockchain
                  </>
                )}
              </Button>
            </form>

            <div className="border-t border-border/50 pt-4">
              <p className="text-xs text-muted text-center">
                Chưa có mã?{" "}
                <Link href="/dashboard" className="text-primary hover:text-accent transition-colors">
                  Hãy bỏ phiếu trước →
                </Link>
              </p>
            </div>
          </div>

          {/* How it works */}
          <div className="glass-card p-6 flex flex-col gap-4">
            <h3 className="font-display font-semibold text-white text-sm">Cách xác minh phiếu bầu</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: "🗳️", title: "Gửi giao dịch", desc: "Hệ thống tạo mã giao dịch duy nhất cho phiếu của bạn" },
                { icon: "⛓️", title: "Lưu on-chain", desc: "Giao dịch được ghi lên blockchain và không thể sửa" },
                { icon: "🔍", title: "Xác minh mọi lúc", desc: "Dùng trang này để kiểm tra phiếu của bạn còn hợp lệ" },
              ].map((item) => (
                <div key={item.title} className="flex flex-col gap-2 text-center">
                  <div className="text-2xl mx-auto">{item.icon}</div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Result Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setResult(null); setTransactionKey(""); }}
        title={result?.valid ? "Đã xác minh ✅" : "Không tìm thấy ❌"}
      >
        {result?.valid ? (
          <div className="flex flex-col gap-4">
            <div className="bg-success/10 border border-success/20 rounded-xl p-4 text-center">
              <p className="text-success font-semibold text-lg">Phiếu của bạn hợp lệ và đã ghi on-chain!</p>
            </div>
            {result?.vote && (
              <div className="flex flex-col gap-3">
                {[
                  { label: "Cuộc bầu cử", value: result.vote.election },
                  { label: "Ứng viên", value: result.vote.candidate },
                  { label: "Thời gian", value: new Date(result.vote.timestamp).toLocaleString() },
                  { label: "Mã giao dịch", value: result.vote.transactionKey },
                ].map((row) => row.value && (
                  <div key={row.label} className="bg-background/60 rounded-xl p-3 border border-border/40">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">{row.label}</p>
                    <p className="text-sm text-white font-mono break-all">{row.value}</p>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => { setModalOpen(false); setResult(null); setTransactionKey(""); }} className="w-full">
              Đóng
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-3xl">❌</div>
            <div>
              <p className="font-display font-semibold text-white text-lg">Không tìm thấy phiếu</p>
              <p className="text-sm text-muted mt-2">
                Mã giao dịch bạn nhập không khớp với dữ liệu. Vui lòng kiểm tra lại.
              </p>
            </div>
            <Button onClick={() => { setModalOpen(false); setResult(null); }} className="w-full mt-2">Thử lại</Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Validate;
