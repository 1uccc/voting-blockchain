import Navbar from "../components/layout/Navbar";
import Button, { OutlinedButton } from "../components/ui/Button";
import { useRouter } from "next/router";

/**
 * Trang cũ dùng cho commit–reveal. Hợp đồng hiện tại (SimpleElection) chỉ cần một giao dịch vote;
 * không còn bước Reveal.
 */
const RevealPage = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <div className="flex flex-col gap-6 max-w-2xl">
          <div className="glass-card p-6">
            <h1 className="text-2xl font-display font-bold text-white">Reveal (không còn dùng)</h1>
            <p className="text-sm text-muted mt-2">
              Phiên bản hiện tại dùng bỏ phiếu trực tiếp: một giao dịch <code className="text-primary/90">vote</code> trên contract{" "}
              <code className="text-primary/90">SimpleElection</code>. Không có bước Reveal thứ hai.
            </p>
            <p className="text-sm text-muted mt-3">
              Để kiểm tra phiếu, dùng transaction hash từ MetaMask hoặc trang Validate.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <OutlinedButton onClick={() => router.push("/dashboard")} className="flex-1 min-w-[140px]">
                Dashboard
              </OutlinedButton>
              <Button onClick={() => router.push("/validate")} className="flex-1 min-w-[140px]">
                Validate
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RevealPage;
