import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { authState } from "../atoms";

const KEY = "chainvote:auth";

export default function AuthPersistor() {
  const [auth, setAuth] = useRecoilState(authState);

  // Restore on first load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.isLoggedIn) {
        setAuth((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(auth));
    } catch {
      // ignore
    }
  }, [auth]);

  return null;
}

