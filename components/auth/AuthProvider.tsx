"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { accountCodeToInternalEmail, normalizeAccountCode } from "@/lib/auth/account-code";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AppRole = "volunteer" | "coordinator" | "admin";

type AuthState = {
  session: Session;
  displayName: string;
  accountCode: string;
  roles: AppRole[];
  isAdmin: boolean;
  isCoordinator: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必須在 AuthProvider 內使用。");
  return value;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authorizedUserIdRef = useRef<string | null>(null);
  const authorizationRequestRef = useRef(0);
  const publicConfig = getPublicSupabaseConfig();
  const isConfigured = Boolean(publicConfig.url && publicConfig.publishableKey);

  const loadAuthorization = useCallback(async (nextSession: Session | null) => {
    const requestId = authorizationRequestRef.current + 1;
    authorizationRequestRef.current = requestId;

    if (!nextSession) {
      authorizedUserIdRef.current = null;
      setSession(null);
      setDisplayName("");
      setAccountCode("");
      setRoles([]);
      setIsActive(false);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    const isSameAuthorizedUser = authorizedUserIdRef.current === nextSession.user.id;
    setSession(nextSession);

    // Keep an already-authorized user's UI mounted while Supabase refreshes the
    // session token. Clear stale authorization only when the signed-in user
    // actually changes.
    if (!isSameAuthorizedUser) {
      setIsLoading(true);
      setDisplayName("");
      setAccountCode("");
      setRoles([]);
      setIsActive(false);
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("display_name,account_code,is_active")
            .eq("id", nextSession.user.id)
            .maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", nextSession.user.id),
        ]);

      if (authorizationRequestRef.current !== requestId) return;

      if (profileError || roleError || !profile) {
        setErrorMessage("無法載入帳號權限，請稍後再試。");
        return;
      }

      authorizedUserIdRef.current = nextSession.user.id;
      setErrorMessage("");
      setDisplayName(String(profile.display_name || "同工"));
      setAccountCode(String(profile.account_code || ""));
      setRoles(
        (roleRows ?? [])
          .map((row) => row.role)
          .filter((role): role is AppRole =>
            ["volunteer", "coordinator", "admin"].includes(String(role))
          )
      );
      setIsActive(Boolean(profile.is_active));
    } catch {
      if (authorizationRequestRef.current === requestId) {
        setErrorMessage("無法載入帳號權限，請稍後再試。");
      }
    } finally {
      if (authorizationRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        void loadAuthorization(data.session);
      })
      .catch(() => {
        if (!mounted) return;
        setErrorMessage("無法確認登入狀態，請重新整理後再試。");
        setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (!mounted) return;
        void loadAuthorization(nextSession);
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [isConfigured, loadAuthorization]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const email = accountCodeToInternalEmail(loginCode);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("帳號或密碼不正確。");
      setLoginCode(normalizeAccountCode(loginCode));
      setPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登入失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = useCallback(async () => {
    await getSupabaseBrowserClient().auth.signOut();
  }, []);

  const contextValue = useMemo<AuthState | null>(() => {
    if (!session || !isActive) return null;
    return {
      session,
      displayName,
      accountCode,
      roles,
      isAdmin: roles.includes("admin"),
      isCoordinator: roles.includes("coordinator") || roles.includes("admin"),
      signOut,
    };
  }, [accountCode, displayName, isActive, roles, session, signOut]);

  if (!isConfigured) {
    return <AuthMessage title="系統尚未完成登入設定" detail="請由管理員設定 Supabase 公開連線資訊後再試。" />;
  }

  if (isLoading) {
    return <AuthMessage title="正在確認登入狀態" detail="請稍候…" loading />;
  }

  if (session && !isActive) {
    return (
      <AuthMessage
        title="帳號尚未啟用"
        detail={errorMessage || "請聯絡管理員確認服事帳號權限。"}
        action={
          <button onClick={() => void signOut()} className="mt-5 rounded-2xl bg-[#6D55A3] px-5 py-3 font-bold text-white">
            登出
          </button>
        }
      />
    );
  }

  if (!session || !contextValue) {
    return (
      <main className="min-h-screen bg-[#FFF9F3] px-5 py-10 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-7">
            <p className="text-xs font-black tracking-[0.24em] text-[#00A6A6]">招待服事</p>
            <h1 className="mt-2 text-2xl font-black text-[#1F2937]">同工登入</h1>
            <p className="mt-2 text-sm font-medium text-[#7B7B74]">使用管理員提供的服事帳號與密碼，不需要電子郵件。</p>
          </div>

          <label htmlFor="account-code" className="text-sm font-black text-[#1F2937]">服事帳號</label>
          <input
            id="account-code"
            autoCapitalize="none"
            autoComplete="username"
            value={loginCode}
            onChange={(event) => setLoginCode(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
            required
          />

          <label htmlFor="password" className="mt-5 block text-sm font-black text-[#1F2937]">密碼</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
            required
          />

          {errorMessage && <p role="alert" className="mt-4 text-sm font-bold text-[#D73A49]">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {isSubmitting ? "登入中" : "登入"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      <div className="relative min-h-screen">
        {children}
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="登出"
          title={`${displayName}｜登出`}
          className="fixed right-3 top-3 z-[80] rounded-full border border-[#E6EAF0] bg-white/95 p-2 text-[#6D55A3] shadow-md backdrop-blur"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </AuthContext.Provider>
  );
}

function AuthMessage({
  title,
  detail,
  loading = false,
  action,
}: {
  title: string;
  detail: string;
  loading?: boolean;
  action?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#FFF9F3] px-5 py-10 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 text-center shadow-xl shadow-[#6D55A3]/10">
        {loading && <Loader2 className="mx-auto mb-4 h-7 w-7 animate-spin text-[#6D55A3]" />}
        <h1 className="text-xl font-black text-[#1F2937]">{title}</h1>
        <p className="mt-2 text-sm font-medium text-[#7B7B74]">{detail}</p>
        {action}
      </div>
    </main>
  );
}
