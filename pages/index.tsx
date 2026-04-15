import { useState, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { authState } from "../atoms";
import Input from "../components/ui/Input";
import Button, { OutlinedButton } from "../components/ui/Button";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import Spinner from "../components/ui/Spinner";
import { GetVoterWallet } from "../lib/api";
import { ethers } from "ethers";
import { getFirebaseAuth, googleProvider } from "../lib/firebaseClient";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [pendingWalletLink, setPendingWalletLink] = useState<{
    idToken: string;
    appToken: string;
    user: any;
    message: string;
  } | null>(null);
  const auth = useRecoilValue(authState);
  const setAuthState = useSetRecoilState(authState);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const toFriendlyAuthError = (e: any) => {
    const code = String(e?.code || "");
    if (code === "auth/email-already-in-use") return "Email đã được sử dụng. Hãy đăng nhập hoặc dùng email khác.";
    if (code === "auth/invalid-email") return "Email không hợp lệ.";
    if (code === "auth/weak-password") return "Mật khẩu quá yếu (tối thiểu 6 ký tự).";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Email hoặc mật khẩu không đúng.";
    if (code === "auth/user-not-found") return "Tài khoản không tồn tại.";
    return e?.message || "";
  };

  useEffect(() => {
    if (auth?.isLoggedIn) {
      router.push("/dashboard");
    }
  }, [auth?.isLoggedIn, router]);

  const enforceWalletLink = async (params: { idToken: string; appToken?: string }) => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("Cần cài MetaMask để tiếp tục.");

    const provider = new ethers.BrowserProvider(eth);
    // This triggers the MetaMask connect popup if the site isn't connected yet.
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const mmAddress = (await signer.getAddress()).toLowerCase();

    const linkRes = await fetch("/api/auth/link-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: params.idToken, walletAddress: mmAddress }),
    });
    const linkJson = await linkRes.json();

    if (!linkRes.ok) {
      // 409 means already linked (email or wallet). We enforce exact match using app token lookup.
      if (linkRes.status === 409) {
        if (!params.appToken) {
          throw new Error("Email/ví đã được liên kết trước đó. Vui lòng đăng nhập lại để kiểm tra ví đã liên kết.");
        }
        const walletRes = await GetVoterWallet(params.appToken);
        const linked = walletRes?.wallet?.public_key?.toLowerCase();
        if (!linked) {
          throw new Error("Tài khoản chưa liên kết với một ví nào. Hãy bấm 'Liên kết ví' để liên kết MetaMask.");
        }
        if (linked !== mmAddress) {
          const linkedLast4 = linked.slice(-4);
          const currentLast4 = mmAddress.slice(-4);
          throw new Error(
            `Ví MetaMask hiện tại không khớp ví đã liên kết (đuôi ví đã liên kết: ...${linkedLast4}, ví hiện tại: ...${currentLast4}). ` +
              `Hãy chuyển đúng ví trong MetaMask rồi bấm 'Liên kết ví'.`
          );
        }
      } else {
        throw new Error(linkJson?.message || "Liên kết ví thất bại.");
      }
    }
  };

  const completeLoginAfterWallet = async (params: {
    idToken: string;
    token: string;
    user: any;
  }) => {
    await enforceWalletLink({ idToken: params.idToken, appToken: params.token });
    setAuthState({ ...params.user, token: params.token, isLoggedIn: true });
    setPendingWalletLink(null);
    router.push(params.user?.role === "admin" ? "/admin" : "/dashboard");
  };

  const handleRetryLinkWallet = async () => {
    if (!pendingWalletLink) return;
    if (submittingRef.current) return;
    try {
      submittingRef.current = true;
      setLoading(true);
      await completeLoginAfterWallet({
        idToken: pendingWalletLink.idToken,
        token: pendingWalletLink.appToken,
        user: pendingWalletLink.user,
      });
      toast.success("Liên kết ví thành công.", {
        style: { background: "#111", color: "#00E676" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Liên kết ví thất bại.", {
        style: { background: "#222", color: "#FF1A1A" },
      });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleAdminLogin = async (event: any) => {
    event.preventDefault();
    if (submittingRef.current) return;
    try {
      submittingRef.current = true;
      setLoading(true);
      if (email === "" || password === "") {
        toast("Vui lòng nhập email và mật khẩu", { style: { background: "#222", color: "#fff" } });
        return;
      }

      const fbAuth = getFirebaseAuth();
      const r = await signInWithEmailAndPassword(fbAuth, email, password);
      const idToken = await r.user.getIdToken();

      const apiRes = await fetch("/api/auth/firebase-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const json = await apiRes.json();
      if (!apiRes.ok) throw new Error(json?.message || "Đăng nhập Firebase thất bại");
      if (json?.user?.role !== "admin") {
        throw new Error("Email/password chỉ dành cho admin. Vui lòng dùng Đăng nhập bằng Google.");
      }

      await completeLoginAfterWallet({ idToken, token: json.token, user: json.user });
      toast.success("Đăng nhập admin thành công", { style: { background: "#111", color: "#00E676" } });
    } catch (error: any) {
      const msg = toFriendlyAuthError(error) || "Đăng nhập thất bại";
      if (String(msg).toLowerCase().includes("ví")) {
        try {
          const fbAuth = getFirebaseAuth();
          const u = fbAuth.currentUser;
          const token = u ? await u.getIdToken() : "";
          if (token) {
            const apiRes = await fetch("/api/auth/firebase-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken: token }),
            });
            const json = await apiRes.json();
            if (apiRes.ok) {
              setPendingWalletLink({
                idToken: token,
                appToken: json.token,
                user: json.user,
                message: msg,
              });
            }
          }
        } catch {
          // ignore
        }
      }
      toast.error(msg, { style: { background: "#222", color: "#FF1A1A" } });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleGoogleSignIn = async () => {
    if (submittingRef.current) return;
    try {
      submittingRef.current = true;
      setLoading(true);
      const auth = getFirebaseAuth();
      const r = await signInWithPopup(auth, googleProvider());
      const idToken = await r.user.getIdToken();

      // Always save/update profile in Firestore for Google users.
      await fetch("/api/auth/upsert-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name: r.user.displayName || undefined }),
      });

      const apiRes = await fetch("/api/auth/firebase-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const json = await apiRes.json();
      if (!apiRes.ok) throw new Error(json?.message || "Đăng nhập Firebase thất bại");

      await completeLoginAfterWallet({ idToken, token: json.token, user: json.user });
      toast.success("Đăng nhập bằng Google thành công", {
        style: { background: "#111", color: "#00E676" },
      });
    } catch (e: any) {
      const msg = toFriendlyAuthError(e) || "Đăng nhập Google thất bại";
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (u) {
        try {
          const idToken = await u.getIdToken();
          const apiRes = await fetch("/api/auth/firebase-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          const json = await apiRes.json();
          if (apiRes.ok) {
            setPendingWalletLink({
              idToken,
              appToken: json.token,
              user: json.user,
              message: msg,
            });
          }
        } catch {
          // ignore
        }
      }
      toast.error(msg, {
        style: { background: "#222", color: "#FF1A1A" },
      });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent/10 rounded-full blur-[150px]"></div>

      <div className="glass-card p-10 w-full max-w-md mx-4 relative z-10 animate-[pulse-slow_4s_ease-in-out_infinite] border-t border-primary/30">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Voting</span> system
          </h1>
          <p className="text-muted text-sm tracking-wide">Thế hệ bỏ phiếu minh bạch và đáng tin cậy.</p>
        </div>

        <p className="text-xs text-muted text-center mb-4">
          Voter chỉ đăng nhập bằng Google để hạn chế tạo tài khoản spam.
        </p>
        <Button onClick={handleGoogleSignIn} className="w-full" disabled={loading}>
          {loading ? <Spinner /> : "Tiếp tục bằng Google"}
        </Button>
        {pendingWalletLink && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-sm text-white font-medium">Cần liên kết ví MetaMask</p>
            <p className="text-xs text-muted mt-1">
              {pendingWalletLink.message}
            </p>
            <div className="flex gap-2 mt-3">
              <Button onClick={handleRetryLinkWallet} className="flex-1" disabled={loading}>
                {loading ? <Spinner /> : "Liên kết ví (MetaMask popup)"}
              </Button>
              <OutlinedButton
                onClick={() => setPendingWalletLink(null)}
                className="px-3"
              >
                Đóng
              </OutlinedButton>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 text-xs text-muted uppercase tracking-widest font-semibold">
          <span className="flex-1 h-px bg-border/50" />
          Admin
          <span className="flex-1 h-px bg-border/50" />
        </div>

        <div className="mt-3">
          <OutlinedButton onClick={() => setAdminLoginOpen((v) => !v)} className="w-full">
            {adminLoginOpen ? "Ẩn đăng nhập admin" : "Đăng nhập admin (email/password)"}
          </OutlinedButton>
        </div>

        {adminLoginOpen && (
          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4 mt-4">
            <Input
              label="Admin Email"
              type="email"
              placeholder="admin@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Mật khẩu"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={handleAdminLogin} className="w-full" disabled={loading}>
              {loading ? <Spinner /> : "Đăng nhập admin"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
