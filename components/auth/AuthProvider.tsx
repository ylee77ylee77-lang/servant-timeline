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
import { Eye, EyeOff, KeyRound, LogIn, LogOut, Loader2 } from "lucide-react";
import { accountCodeToInternalEmail, normalizeAccountCode } from "@/lib/auth/account-code";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { stopBackgroundRemindersOnSignOut } from "@/lib/notifications/background-device-client";
import { normalizeRecoveryName, requiresPasswordChange } from "@/lib/auth/password-reset";
import {
  cleanRegistrationMailLink, normalizeRegistrationCodeInput, readRegistrationMailLink,
  REGISTRATION_PROGRESS_KEY, type RegistrationDraft,
} from "@/lib/auth/registration-verification-client";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { AvatarIconPicker } from "@/components/profile/AvatarIconPicker";
import { AvatarDisplayModeSelector } from "@/components/profile/AvatarControls";
import { SettingsAccordionCard } from "@/components/profile/SettingsAccordionCard";
import { SystemAvatar } from "@/components/profile/SystemAvatar";
import { AVATAR_DISPLAY_LABELS, getDefaultAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/profile/avatar";

export type AppRole = "volunteer" | "coordinator" | "admin";

type AuthState = {
  session: Session;
  displayName: string;
  accountCode: string;
  avatarConfig: AvatarConfig;
  updateAvatarConfig: (next: AvatarConfig) => void;
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
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(getDefaultAvatarConfig);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [recoveryDisplayName, setRecoveryDisplayName] = useState("");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [isPasswordResetSubmitting, setIsPasswordResetSubmitting] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationDisplayName, setRegistrationDisplayName] = useState("");
  const [registrationAccountCode, setRegistrationAccountCode] = useState("");
  const [registrationContactEmail, setRegistrationContactEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationPasswordConfirm, setRegistrationPasswordConfirm] = useState("");
  const [registrationAvatar, setRegistrationAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [registrationAvatarOpen, setRegistrationAvatarOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [registrationIsError, setRegistrationIsError] = useState(false);
  const [isRegistrationSubmitting, setIsRegistrationSubmitting] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
  const [registrationOtp, setRegistrationOtp] = useState("");
  const [registrationEmailBusy, setRegistrationEmailBusy] = useState(false);
  const [registrationClock, setRegistrationClock] = useState(() => Date.now());
  const [registrationCopyCode, setRegistrationCopyCode] = useState("");
  const [registrationCopyMessage, setRegistrationCopyMessage] = useState("");
  const registrationRequestInFlight = useRef(false);
  const registrationMailHandled = useRef(false);
  const registrationCopyInput = useRef<HTMLInputElement>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegistrationPassword, setShowRegistrationPassword] = useState(false);
  const [showRegistrationPasswordConfirm, setShowRegistrationPasswordConfirm] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [forcedPassword, setForcedPassword] = useState("");
  const [forcedPasswordConfirm, setForcedPasswordConfirm] = useState("");
  const [showForcedPassword, setShowForcedPassword] = useState(false);
  const [showForcedPasswordConfirm, setShowForcedPasswordConfirm] = useState(false);
  const [forcedPasswordMessage, setForcedPasswordMessage] = useState("");
  const [forcedPasswordIsError, setForcedPasswordIsError] = useState(false);
  const [isForcedPasswordSubmitting, setIsForcedPasswordSubmitting] = useState(false);
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
      setAvatarConfig(getDefaultAvatarConfig());
      setRoles([]);
      setIsActive(false);
      setMustChangePassword(false);
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    const isSameAuthorizedUser = authorizedUserIdRef.current === nextSession.user.id;
    setSession(nextSession);
    setMustChangePassword(requiresPasswordChange(nextSession.user.app_metadata));

    // Keep an already-authorized user's UI mounted while Supabase refreshes the
    // session token. Clear stale authorization only when the signed-in user
    // actually changes.
    if (!isSameAuthorizedUser) {
      setIsLoading(true);
      setDisplayName("");
      setAccountCode("");
      setAvatarConfig(getDefaultAvatarConfig());
      setRoles([]);
      setIsActive(false);
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("display_name,account_code,is_active,avatar_config")
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
      setAvatarConfig(normalizeAvatarConfig(profile.avatar_config));
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

    // Supabase emits INITIAL_SESSION after the browser client finishes restoring
    // its persisted session. Rely on that single initialization path instead of
    // calling getSession() in parallel, which could trigger duplicate profile
    // and role queries during startup.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (!mounted) return;

        // Token refreshes do not change this app's authorization data. Keep the
        // current UI mounted and only replace the session token for an already
        // authorized user.
        if (
          event === "TOKEN_REFRESHED"
          && nextSession
          && authorizedUserIdRef.current === nextSession.user.id
        ) {
          setSession(nextSession);
          setMustChangePassword(requiresPasswordChange(nextSession.user.app_metadata));
          return;
        }

        void loadAuthorization(nextSession);
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [isConfigured, loadAuthorization]);


  const rememberRegistrationProgress = useCallback((pending: boolean) => {
    try {
      if (pending) window.localStorage.setItem(REGISTRATION_PROGRESS_KEY, "1");
      else window.localStorage.removeItem(REGISTRATION_PROGRESS_KEY);
    } catch { /* The HttpOnly server cookie still protects the registration. */ }
  }, []);

  const applyRegistrationDraft = useCallback((draft: RegistrationDraft | null) => {
    setRegistrationDraft(draft);
    setRegistrationClock(Date.now());
    rememberRegistrationProgress(Boolean(draft));
    if (!draft) return;
    setRegistrationDisplayName(draft.displayName);
    setRegistrationAccountCode(draft.accountCode);
    setRegistrationContactEmail(draft.contactEmail);
  }, [rememberRegistrationProgress]);

  const requestRegistrationEmail = useCallback(async (body: Record<string, unknown>) => {
    if (registrationRequestInFlight.current) return false;
    registrationRequestInFlight.current = true;
    setRegistrationEmailBusy(true);
    setRegistrationMessage("");
    setRegistrationIsError(false);
    try {
      const response = await fetch("/api/register/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (data && Object.prototype.hasOwnProperty.call(data, "draft")) {
        applyRegistrationDraft(data.draft ?? null);
      }
      if (!response.ok) throw new Error(data?.error || "目前無法完成驗證，請稍後再試。");
      if (body.action === "send") setRegistrationMessage("驗證信已寄出，請開啟信件或貼上驗證碼。");
      if (body.action === "verify-link" || body.action === "verify-code") setRegistrationMessage("電子郵件驗證成功");
      setRegistrationOtp("");
      return true;
    } catch (error) {
      setRegistrationIsError(true);
      setRegistrationMessage(error instanceof Error ? error.message : "目前無法完成驗證，請稍後再試。");
      if (body.action === "verify-code") setRegistrationOtp("");
      return false;
    } finally {
      registrationRequestInFlight.current = false;
      setRegistrationEmailBusy(false);
    }
  }, [applyRegistrationDraft]);

  const restoreRegistration = useCallback(async (open: boolean) => {
    if (registrationRequestInFlight.current) return;
    registrationRequestInFlight.current = true;
    setRegistrationEmailBusy(true);
    try {
      const response = await fetch("/api/register/verification", {
        credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      applyRegistrationDraft(data.draft ?? null);
      if (data.draft && open) {
        setShowRegistration(true);
        setShowPasswordReset(false);
      }
    } catch { /* Keep existing fields when temporarily offline. */ }
    finally {
      registrationRequestInFlight.current = false;
      setRegistrationEmailBusy(false);
    }
  }, [applyRegistrationDraft]);

  useEffect(() => {
    // A token lives in the fragment, not a GET query or access log. Only
    // the user-facing browser redeems it by POST. Avoid a second redemption
    // during React StrictMode's development remount.
    const timer = window.setTimeout(() => {
      const href = window.location.href;
      const mail = readRegistrationMailLink(href);
      if (new URL(href).searchParams.has("registration")) {
        registrationMailHandled.current = true;
        window.history.replaceState(window.history.state, "", cleanRegistrationMailLink(href));
        if (mail?.mode === "copy") {
          setRegistrationCopyCode(mail.value);
          return;
        }
        setShowRegistration(true);
        setShowPasswordReset(false);
        if (mail?.mode === "verify") {
          void requestRegistrationEmail({ action: "verify-link", token: mail.value });
        } else {
          setRegistrationIsError(true);
          setRegistrationMessage("驗證連結無效，請重新發送驗證信。");
          void restoreRegistration(false);
        }
        return;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestRegistrationEmail, restoreRegistration]);

  useEffect(() => {
    if (isLoading || session) return;
    const timer = window.setTimeout(() => {
      if (registrationMailHandled.current) return;
      try {
        if (window.location.pathname === "/" && window.localStorage.getItem(REGISTRATION_PROGRESS_KEY)) void restoreRegistration(true);
      } catch { /* Restore is also available from the registration button. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isLoading, session, restoreRegistration]);

  const hasRegistrationDraft = Boolean(registrationDraft);
  useEffect(() => {
    if (!showRegistration || !hasRegistrationDraft || isRegistrationSubmitting) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void restoreRegistration(false);
    };
    const tick = window.setInterval(() => setRegistrationClock(Date.now()), 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [showRegistration, hasRegistrationDraft, isRegistrationSubmitting, restoreRegistration]);

  const registrationVerified = registrationDraft?.status === "verified"
    && Date.parse(registrationDraft.expiresAt) > registrationClock;
  const registrationResendSeconds = registrationDraft
    ? Math.max(0, Math.ceil((Date.parse(registrationDraft.resendAt) - registrationClock) / 1000)) : 0;
  const registrationOtpExpired = registrationDraft
    && (registrationDraft.status === "expired" || registrationDraft.status === "locked"
      || Date.parse(registrationDraft.expiresAt) <= registrationClock);

  const sendRegistrationEmail = () => requestRegistrationEmail({
    action: "send",
    displayName: registrationDisplayName,
    accountCode: registrationAccountCode,
    contactEmail: registrationContactEmail,
  });

  const changeRegistrationIdentity = async () => {
    const cancelled = await requestRegistrationEmail({ action: "cancel" });
    if (cancelled) {
      setRegistrationPassword("");
      setRegistrationPasswordConfirm("");
      setRegistrationAvatarOpen(false);
    }
  };

  const handleRegistrationOtp = (value: string) => {
    const next = normalizeRegistrationCodeInput(value);
    setRegistrationOtp(next);
    if (next.length === 6) void requestRegistrationEmail({ action: "verify-code", code: next });
  };

  const copyRegistrationOtp = async () => {
    try {
      await navigator.clipboard.writeText(registrationCopyCode);
      setRegistrationCopyMessage("已複製，請返回原註冊頁面貼上。");
    } catch {
      registrationCopyInput.current?.focus();
      registrationCopyInput.current?.select();
      setRegistrationCopyMessage("請長按選取的驗證碼並複製，再返回原註冊頁面貼上。");
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setLoginNotice("");
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

  const handlePasswordResetRequest = async () => {
    setPasswordResetMessage("");
    setErrorMessage("");

    const normalizedName = normalizeRecoveryName(recoveryDisplayName);
    if (!normalizedName) {
      setPasswordResetMessage("請先輸入你的姓名。");
      return;
    }

    setIsPasswordResetSubmitting(true);
    try {
      const response = await fetch("/api/password-reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: normalizedName }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "目前無法送出帳號／密碼協助申請。");
      }

      setRecoveryDisplayName(normalizedName);
      setPasswordResetMessage(
        data?.message || "申請已送出。管理員確認本人後，系統會將登入資料寄到你登記的 Email。"
      );
    } catch (error) {
      setPasswordResetMessage(
        error instanceof Error ? error.message : "目前無法送出帳號／密碼協助申請。"
      );
    } finally {
      setIsPasswordResetSubmitting(false);
    }
  };


  const handleRegistration = async (event: FormEvent) => {
    event.preventDefault();
    setRegistrationMessage("");
    setRegistrationIsError(false);

    if (!registrationVerified) {
      if (!registrationDraft || registrationOtpExpired) {
        await sendRegistrationEmail();
      } else if (registrationOtp.length === 6) {
        await requestRegistrationEmail({ action: "verify-code", code: registrationOtp });
      } else {
        setRegistrationIsError(true);
        setRegistrationMessage("請先點擊信件連結或輸入六位數驗證碼。");
      }
      return;
    }

    const normalizedCode = normalizeAccountCode(registrationAccountCode);
    if (registrationPassword !== registrationPasswordConfirm) {
      setRegistrationIsError(true);
      setRegistrationMessage("兩次輸入的密碼不一致。");
      return;
    }

    setIsRegistrationSubmitting(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: registrationDisplayName,
          accountCode: normalizedCode,
          contactEmail: registrationContactEmail,
          password: registrationPassword,
          avatarConfig: registrationAvatar,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "註冊失敗，請稍後再試。");
      }

      setRegistrationIsError(false);
      setRegistrationMessage(data?.message || "註冊完成，請等待管理員啟用帳號。");
      applyRegistrationDraft(null);
      setLoginNotice(data?.message || "註冊完成，請等待管理員啟用帳號。");
      setShowRegistration(false);
      setLoginCode(normalizedCode);
      setRegistrationDisplayName("");
      setRegistrationAccountCode("");
      setRegistrationContactEmail("");
      setRegistrationPassword("");
      setRegistrationPasswordConfirm("");
      setRegistrationAvatar(getDefaultAvatarConfig());
      setRegistrationAvatarOpen(false);
    } catch (error) {
      setRegistrationIsError(true);
      setRegistrationMessage(error instanceof Error ? error.message : "註冊失敗，請稍後再試。");
      void restoreRegistration(false);
    } finally {
      setIsRegistrationSubmitting(false);
    }
  };

  const handleForcedPasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    setForcedPasswordMessage("");
    setForcedPasswordIsError(false);

    if (forcedPassword !== forcedPasswordConfirm) {
      setForcedPasswordIsError(true);
      setForcedPasswordMessage("兩次輸入的密碼不一致。");
      return;
    }

    setIsForcedPasswordSubmitting(true);
    try {
      if (!session?.access_token) throw new Error("登入階段已失效，請重新登入。");

      const response = await fetch("/api/password-change", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: forcedPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "更新密碼失敗，請稍後再試。");

      setForcedPassword("");
      setForcedPasswordConfirm("");
      setForcedPasswordMessage("");
      setMustChangePassword(false);
      setLoginCode(accountCode);
      setLoginNotice("密碼已更新，請使用新密碼重新登入。");
      await stopBackgroundRemindersOnSignOut(session?.access_token);
      await getSupabaseBrowserClient().auth.signOut();
    } catch (error) {
      setForcedPasswordIsError(true);
      setForcedPasswordMessage(
        error instanceof Error ? error.message : "更新密碼失敗，請稍後再試。"
      );
    } finally {
      setIsForcedPasswordSubmitting(false);
    }
  };

  const signOut = useCallback(async () => {
    const stopped = await stopBackgroundRemindersOnSignOut(session?.access_token);
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error && !stopped) window.alert("尚未完成登出及背景提醒停止，請確認網路後重試。");
  }, [session?.access_token]);

  // The avatar editor persists changes through the existing authorized PUT
  // endpoint; this only updates the already-loaded profile inside this session.
  const updateAvatarConfig = useCallback((next: AvatarConfig) => {
    setAvatarConfig(normalizeAvatarConfig(next));
  }, []);

  const contextValue = useMemo<AuthState | null>(() => {
    if (!session || !isActive) return null;
    return {
      session,
      displayName,
      accountCode,
      avatarConfig,
      updateAvatarConfig,
      roles,
      isAdmin: roles.includes("admin"),
      isCoordinator: roles.includes("coordinator") || roles.includes("admin"),
      signOut,
    };
  }, [accountCode, avatarConfig, displayName, isActive, roles, session, signOut, updateAvatarConfig]);

  if (registrationCopyCode) {
    return (
      <main className="min-h-screen bg-[#F5F6F6] px-5 py-10 flex items-center justify-center">
        <section className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 text-center shadow-xl shadow-[#785AA5]/10">
          <p className="text-xs font-black tracking-[0.24em] text-[#007D7D]">SHEKINAH</p>
          <h1 className="mt-4 text-xl font-black text-[#353B3B]">複製驗證碼</h1>
          <p className="mt-2 text-sm leading-6 text-[#7A7A73]">複製後請返回原本的招待服事註冊頁面貼上。</p>
          <input ref={registrationCopyInput} readOnly aria-label="六位數驗證碼" value={registrationCopyCode}
            className="mt-5 w-full rounded-2xl border border-[#785AA5]/20 bg-[#F6F3FA] px-3 py-5 text-center text-3xl font-black tracking-[0.3em] text-[#785AA5]" />
          <button type="button" onClick={() => void copyRegistrationOtp()}
            className="mt-4 w-full rounded-2xl bg-[#785AA5] px-4 py-3 font-bold text-white">複製驗證碼</button>
          <p role="status" className="mt-3 text-sm leading-6 text-[#007D7D]">{registrationCopyMessage}</p>
          <p className="mt-3 text-xs text-[#7A7A73]">驗證有效期限為 10 分鐘</p>
          <button type="button" onClick={() => { setRegistrationCopyCode(""); setRegistrationCopyMessage(""); }}
            className="mt-5 text-sm font-bold text-[#785AA5]">返回系統</button>
        </section>
      </main>
    );
  }

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

  if (session && isActive && mustChangePassword) {
    return (
      <main className="min-h-screen bg-[#FFF9F3] px-5 py-10 flex items-center justify-center">
        <form onSubmit={handleForcedPasswordChange} className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-7">
            <p className="text-xs font-black tracking-[0.24em] text-[#00A6A6]">招待服事</p>
            <h1 className="mt-2 text-2xl font-black text-[#1F2937]">設定新密碼</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
              您目前使用的是管理員提供的臨時密碼。請先設定自己的新密碼，再進入系統。
            </p>
          </div>

          <PasswordInput
            id="forced-password"
            label="新密碼（至少 8 位字元）"
            value={forcedPassword}
            onChange={setForcedPassword}
            visible={showForcedPassword}
            onToggle={() => setShowForcedPassword((value) => !value)}
            autoComplete="new-password"
          />
          <PasswordInput
            id="forced-password-confirm"
            label="再次輸入新密碼"
            value={forcedPasswordConfirm}
            onChange={setForcedPasswordConfirm}
            visible={showForcedPasswordConfirm}
            onToggle={() => setShowForcedPasswordConfirm((value) => !value)}
            autoComplete="new-password"
            className="mt-5"
          />

          {forcedPasswordMessage && (
            <p role="status" className={`mt-4 text-sm font-bold leading-6 ${forcedPasswordIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>
              {forcedPasswordMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isForcedPasswordSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60"
          >
            {isForcedPasswordSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
            {isForcedPasswordSubmitting ? "更新中" : "設定新密碼"}
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 w-full text-center text-sm font-black text-[#7B7B74]"
          >
            登出
          </button>
        </form>
      </main>
    );
  }

  if (!session || !contextValue || showRegistration) {
    return (
      <main className="min-h-screen bg-[#FFF9F3] px-5 py-10 flex items-center justify-center">
        {showRegistration ? (
          <form onSubmit={handleRegistration} className="max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
            <div className="mb-7">
              <p className="text-xs font-black tracking-[0.24em] text-[#00A6A6]">招待服事</p>
              <h1 className="mt-2 text-2xl font-black text-[#1F2937]">註冊新帳號</h1>
              <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
                {registrationVerified ? "電子郵件已驗證，請繼續完成設定。註冊後需由管理員啟用。" : "先完成電子郵件驗證，再設定密碼與大頭貼。註冊後需由管理員啟用。"}
              </p>
            </div>

            <label htmlFor="registration-name" className="text-sm font-black text-[#1F2937]">姓名（中文全名）</label>
            <input
              id="registration-name"
              autoComplete="name"
              value={registrationDisplayName}
              readOnly={Boolean(registrationDraft) || registrationEmailBusy || isRegistrationSubmitting}
              onChange={(event) => setRegistrationDisplayName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
              required
            />

            <label htmlFor="registration-code" className="mt-5 block text-sm font-black text-[#1F2937]">服事帳號</label>
            <input
              id="registration-code"
              autoCapitalize="none"
              autoComplete="username"
              value={registrationAccountCode}
              readOnly={Boolean(registrationDraft) || registrationEmailBusy || isRegistrationSubmitting}
              onChange={(event) => setRegistrationAccountCode(event.target.value)}
              placeholder="英文小寫、數字、點、底線或連字號"
              className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
              required
            />

            <label htmlFor="registration-email" className="mt-5 block text-sm font-black text-[#1F2937]">聯絡 Email</label>
            <input
              id="registration-email"
              type="email"
              autoComplete="email"
              value={registrationContactEmail}
              readOnly={Boolean(registrationDraft) || registrationEmailBusy || isRegistrationSubmitting}
              onChange={(event) => setRegistrationContactEmail(event.target.value)}
              placeholder="用於忘記帳號／密碼時收取登入資料"
              className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
              required
            />

            {registrationDraft && (
              <section className="mt-4 rounded-2xl border border-[#785AA5]/15 bg-[#F6F3FA] p-4">
                {registrationVerified ? (
                  <div className="flex items-center gap-2 font-bold text-[#007D7D]">
                    <span aria-hidden="true">✓</span> 電子郵件已驗證
                  </div>
                ) : registrationOtpExpired ? (
                  <p role="status" className="rounded-xl bg-[#FFF2F4] px-3 py-3 text-sm font-bold text-[#A93143]">
                    驗證碼已失效，請重新發送。
                  </p>
                ) : (
                  <>
                    <label htmlFor="registration-otp" className="block text-sm font-black text-[#785AA5]">六位數驗證碼</label>
                    <input id="registration-otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                      value={registrationOtp} onChange={(event) => handleRegistrationOtp(event.target.value)}
                      disabled={registrationEmailBusy || isRegistrationSubmitting}
                      placeholder="輸入或貼上" aria-describedby="registration-otp-help"
                      className="mt-2 w-full rounded-xl border border-[#785AA5]/25 bg-white px-3 py-3 text-center text-xl font-bold tracking-[0.2em] text-[#785AA5] outline-none focus:border-[#785AA5]" />
                    <p id="registration-otp-help" className="mt-2 text-xs leading-5 text-[#7A7A73]">貼上完整六位數即可自動驗證，也可以點擊信件中的驗證連結。</p>
                  </>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => void changeRegistrationIdentity()} disabled={registrationEmailBusy || isRegistrationSubmitting}
                    className="text-xs font-bold text-[#785AA5] disabled:opacity-50">修改註冊資料</button>
                  {!registrationVerified && (
                    <button type="button" onClick={() => void sendRegistrationEmail()}
                      disabled={registrationEmailBusy || isRegistrationSubmitting || registrationResendSeconds > 0}
                      className="text-xs font-bold text-[#785AA5] disabled:opacity-50">
                      {registrationResendSeconds > 0 ? registrationResendSeconds + " 秒後重新發送" : "重新發送"}
                    </button>
                  )}
                </div>
              </section>
            )}

            {registrationVerified && (
              <>
            <div className="mt-5">
              <SettingsAccordionCard
                panelId="registration-avatar-options"
                title="大頭貼"
                summary={["選填", AVATAR_DISPLAY_LABELS[registrationAvatar.displayMode]].join("・")}
                icon={<SystemAvatar config={registrationAvatar} displayName={registrationDisplayName} size={registrationAvatarOpen ? 80 : 52} />}
                expanded={registrationAvatarOpen}
                onToggle={() => setRegistrationAvatarOpen((open) => !open)}
                stickyHeader
              >
                <AvatarDisplayModeSelector
                  value={registrationAvatar.displayMode}
                  onChange={(mode) => setRegistrationAvatar((avatar) => ({ ...avatar, displayMode: mode }))}
                  disabled={isRegistrationSubmitting}
                />
                {registrationAvatar.displayMode === "default" && (
                  <AvatarIconPicker
                    value={registrationAvatar}
                    onChange={setRegistrationAvatar}
                    disabled={isRegistrationSubmitting}
                  />
                )}
                {registrationAvatar.displayMode === "custom" && (
                  <div className="mt-5">
                    <AvatarEditor value={registrationAvatar} onChange={setRegistrationAvatar} showPreview={false} />
                  </div>
                )}
              </SettingsAccordionCard>
            </div>

            <PasswordInput
              id="registration-password"
              label="密碼（至少 8 位字元）"
              value={registrationPassword}
              onChange={setRegistrationPassword}
              visible={showRegistrationPassword}
              onToggle={() => setShowRegistrationPassword((value) => !value)}
              autoComplete="new-password"
              className="mt-5"
            />
            <PasswordInput
              id="registration-password-confirm"
              label="再次輸入密碼"
              value={registrationPasswordConfirm}
              onChange={setRegistrationPasswordConfirm}
              visible={showRegistrationPasswordConfirm}
              onToggle={() => setShowRegistrationPasswordConfirm((value) => !value)}
              autoComplete="new-password"
              className="mt-5"
            />

              </>
            )}

            {registrationMessage && (
              <p role="status" className={`mt-4 text-sm font-bold leading-6 ${registrationIsError ? "rounded-xl bg-[#FFF2F4] px-3 py-2 text-[#A93143]" : "text-[#007D7D]"}`}>
                {registrationMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isRegistrationSubmitting || registrationEmailBusy || Boolean(registrationDraft && !registrationVerified && (registrationOtpExpired ? registrationResendSeconds > 0 : registrationOtp.length !== 6))}
              className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-black disabled:opacity-60 ${registrationVerified ? "bg-[#785AA5] text-white" : "bg-[#00B8B8] text-[#073B3B]"}`}
            >
              {isRegistrationSubmitting || registrationEmailBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isRegistrationSubmitting ? "註冊中" : registrationEmailBusy ? "處理中" : registrationVerified ? "建立帳號" : registrationDraft && !registrationOtpExpired ? "驗證電子郵件" : "發送驗證信"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowRegistration(false);
                setRegistrationAvatarOpen(false);
                setRegistrationPassword("");
                setRegistrationPasswordConfirm("");
                setRegistrationMessage("");
                setRegistrationIsError(false);
              }}
              className="mt-4 w-full text-center text-sm font-black text-[#6D55A3]"
            >
              返回登入
            </button>
          </form>
        ) : showPasswordReset ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handlePasswordResetRequest();
            }}
            className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10"
          >
            <div className="mb-7">
              <p className="text-xs font-black tracking-[0.24em] text-[#00A6A6]">招待服事</p>
              <h1 className="mt-2 text-2xl font-black text-[#1F2937]">帳號／密碼協助申請</h1>
              <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
                不論忘記服事帳號或密碼，都只要填姓名。管理員確認本人後，系統會把原服事帳號與新的臨時密碼寄到你登記的 Email。
              </p>
            </div>

            <label htmlFor="recovery-display-name" className="text-sm font-black text-[#1F2937]">姓名（中文全名）</label>
            <input
              id="recovery-display-name"
              autoComplete="name"
              value={recoveryDisplayName}
              onChange={(event) => setRecoveryDisplayName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
              required
            />

            {passwordResetMessage && (
              <p role="status" className="mt-4 text-sm font-bold leading-6 text-[#008A7A]">
                {passwordResetMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isPasswordResetSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60"
            >
              {isPasswordResetSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              {isPasswordResetSubmitting ? "送出中" : "送出帳號／密碼協助申請"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPasswordReset(false);
                setPasswordResetMessage("");
              }}
              className="mt-4 w-full text-center text-sm font-black text-[#6D55A3]"
            >
              返回登入
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="w-full max-w-sm rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
            <div className="mb-7">
              <p className="text-xs font-black tracking-[0.24em] text-[#00A6A6]">招待服事</p>
              <h1 className="mt-2 text-2xl font-black text-[#1F2937]">同工登入</h1>
              <p className="mt-2 text-sm font-medium text-[#7B7B74]">請使用您的服事帳號與密碼登入。</p>
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

            <PasswordInput
              id="password"
              label="密碼（至少 8 位字元）"
              value={password}
              onChange={setPassword}
              visible={showLoginPassword}
              onToggle={() => setShowLoginPassword((value) => !value)}
              autoComplete="current-password"
              className="mt-5"
            />

            {loginNotice && <p role="status" className="mt-4 text-sm font-bold text-[#008A7A]">{loginNotice}</p>}
            {errorMessage && <p role="alert" className="mt-4 text-sm font-bold text-[#D73A49]">{errorMessage}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              {isSubmitting ? "登入中" : "登入"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPasswordReset(true);
                setRecoveryDisplayName("");
                setPasswordResetMessage("");
                setErrorMessage("");
              }}
              className="mt-4 w-full text-center text-sm font-black text-[#6D55A3]"
            >
              忘記帳號或密碼？
            </button>

            <div className="mt-5 border-t border-[#E6EAF0] pt-5">
              <p className="text-center text-xs font-bold text-[#7B7B74]">還沒有帳號？</p>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordReset(false);
                  setPasswordResetMessage("");
                  setShowRegistration(true);
                  setRegistrationAvatarOpen(false);
                  setRegistrationMessage("");
                  setRegistrationIsError(false);
                  void restoreRegistration(false);
                }}
                className="mt-2 w-full rounded-2xl border border-[#6D55A3]/20 bg-[#F3EEFF] px-5 py-3 font-black text-[#6D55A3]"
              >
                註冊新帳號
              </button>
            </div>
          </form>
        )}
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

function PasswordInput({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-black text-[#1F2937]">{label}</label>
      <div className="relative mt-2">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={72}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 pr-12 outline-none focus:border-[#6D55A3]"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "隱藏密碼" : "顯示密碼"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#7B7B74]"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
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
