"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { useAuth, type AppRole } from "@/components/auth/AuthProvider";

type PasswordResetRequest = {
  userId: string;
  accountCode: string;
  displayName: string;
  isActive: boolean;
  requestedAt: string;
};

export default function AdminUsersPage() {
  const { isAdmin, session } = useAuth();
  const [accountCode, setAccountCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("volunteer");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [resetAccountCode, setResetAccountCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetIsError, setResetIsError] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingResets, setIsLoadingResets] = useState(false);

  const loadResetRequests = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoadingResets(true);
    try {
      const response = await fetch("/api/admin/password-resets", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "無法讀取密碼重設申請。");
      setResetRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch (error) {
      setResetIsError(true);
      setResetMessage(error instanceof Error ? error.message : "無法讀取密碼重設申請。");
    } finally {
      setIsLoadingResets(false);
    }
  }, [isAdmin, session.access_token]);

  useEffect(() => {
    void loadResetRequests();
  }, [loadResetRequests]);

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[#FFF9F3] px-5 py-10">
        <div className="mx-auto max-w-md rounded-[24px] border border-[#E6EAF0] bg-white p-6 text-center">
          <h1 className="text-xl font-black text-[#1F2937]">無法進入帳號管理</h1>
          <p className="mt-2 text-sm font-medium text-[#7B7B74]">只有管理員可以建立服事帳號。</p>
          <Link href="/" className="mt-5 inline-flex rounded-xl bg-[#6D55A3] px-4 py-2 font-bold text-white">返回首頁</Link>
        </div>
      </main>
    );
  }

  const handlePasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    setResetMessage("");
    setResetIsError(false);
    setIsResetting(true);

    try {
      const response = await fetch("/api/admin/password-resets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountCode: resetAccountCode,
          password: resetPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "重設密碼失敗。");

      setResetIsError(false);
      setResetMessage(
        `已重設 ${data.user.displayName}（${data.user.accountCode}）的密碼。`
      );
      setResetAccountCode("");
      setResetPassword("");
      await loadResetRequests();
    } catch (error) {
      setResetIsError(true);
      setResetMessage(error instanceof Error ? error.message : "重設密碼失敗。");
    } finally {
      setIsResetting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountCode, displayName, password, role }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "建立帳號失敗。");

      setIsError(false);
      setMessage(`已建立 ${data.user.displayName}（${data.user.accountCode}）。`);
      setAccountCode("");
      setDisplayName("");
      setPassword("");
      setRole("volunteer");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "建立帳號失敗。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FFF9F3] px-5 py-8">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-[#6D55A3]">
          <ArrowLeft className="h-4 w-4" /> 返回首頁
        </Link>
        <section className="mb-6 rounded-[28px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-[#1F2937]">待處理密碼重設</h1>
              <p className="mt-1 text-sm font-medium leading-6 text-[#7B7B74]">
                同工在登入頁送出的申請會顯示在這裡。只有管理員可以真正設定新密碼。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadResetRequests()}
              disabled={isLoadingResets}
              aria-label="重新整理密碼重設申請"
              className="rounded-xl border border-[#6D55A3]/15 bg-[#F3EEFF] p-2 text-[#6D55A3] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingResets ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {resetRequests.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9F3] px-4 py-4 text-sm font-bold text-[#7B7B74]">
                目前沒有待處理的密碼重設申請。
              </div>
            ) : (
              resetRequests.map((request) => (
                <div key={request.userId} className="rounded-2xl border border-[#E6EAF0] p-4">
                  <div className="font-black text-[#1F2937]">{request.displayName}</div>
                  <div className="mt-1 text-sm font-bold text-[#6D55A3]">{request.accountCode}</div>
                  <div className="mt-1 text-xs font-medium text-[#7B7B74]">
                    申請時間：{new Date(request.requestedAt).toLocaleString("zh-TW")}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setResetAccountCode(request.accountCode);
                      setResetPassword("");
                      setResetMessage("");
                      setResetIsError(false);
                    }}
                    className="mt-3 rounded-xl bg-[#F3EEFF] px-3 py-2 text-xs font-black text-[#6D55A3]"
                  >
                    選擇這個帳號
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <form onSubmit={handlePasswordReset} className="mb-6 rounded-[28px] border border-[#6D55A3]/15 bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-6">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#1F2937]">
              <KeyRound className="h-5 w-5 text-[#6D55A3]" />
              重設既有帳號密碼
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
              可處理上方申請，也可直接輸入既有服事帳號。新密碼不會寫入活動紀錄。
            </p>
          </div>

          <Field
            label="要重設的服事帳號"
            value={resetAccountCode}
            onChange={setResetAccountCode}
            autoComplete="off"
            hint="輸入原本的服事帳號，例如 dongli"
          />
          <Field
            label="新密碼"
            value={resetPassword}
            onChange={setResetPassword}
            type="password"
            autoComplete="new-password"
            hint="8–72 字元，請用安全方式交給本人"
          />

          {resetMessage && (
            <p role="status" className={`mt-4 text-sm font-bold ${resetIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>
              {resetMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isResetting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60"
          >
            {isResetting ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
            {isResetting ? "重設中" : "設定新密碼"}
          </button>
        </form>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-[#1F2937]">建立服事帳號</h1>
            <p className="mt-2 text-sm font-medium text-[#7B7B74]">帳號由管理員建立；系統不寄信，也不要求同工提供電子郵件。</p>
          </div>

          <Field label="姓名" value={displayName} onChange={setDisplayName} autoComplete="name" />
          <Field label="服事帳號" value={accountCode} onChange={setAccountCode} autoComplete="off" hint="3–32 字元：英文小寫、數字、點、底線或連字號" />
          <Field label="初始密碼" value={password} onChange={setPassword} type="password" autoComplete="new-password" hint="8–72 字元，請用安全方式交給本人" />

          <label htmlFor="role" className="mt-5 block text-sm font-black text-[#1F2937]">角色</label>
          <select id="role" value={role} onChange={(event) => setRole(event.target.value as AppRole)} className="mt-2 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3">
            <option value="volunteer">同工</option>
            <option value="coordinator">帶領者／協調員</option>
            <option value="admin">管理員</option>
          </select>

          {message && <p role="status" className={`mt-4 text-sm font-bold ${isError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>{message}</p>}

          <button type="submit" disabled={isSubmitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60">
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            {isSubmitting ? "建立中" : "建立帳號"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const id = `field-${label}`;
  return (
    <div className="mt-5 first:mt-0">
      <label htmlFor={id} className="block text-sm font-black text-[#1F2937]">{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} minLength={type === "password" ? 8 : undefined} maxLength={type === "password" ? 72 : undefined} required className="mt-2 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]" />
      {hint && <p className="mt-1.5 text-xs font-medium text-[#7B7B74]">{hint}</p>}
    </div>
  );
}
