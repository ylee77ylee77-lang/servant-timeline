"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Loader2, RefreshCw, ShieldAlert, UserCheck, UserPlus } from "lucide-react";
import { useAuth, type AppRole } from "@/components/auth/AuthProvider";

type AccountRecoveryRequest = {
  requestLogId: string;
  requestedName: string;
  requestedAt: string;
};

type RegisteredUser = {
  id: string;
  accountCode: string;
  displayName: string;
  contactEmail: string;
  isActive: boolean;
  roles: AppRole[];
};

export default function AdminUsersPage() {
  const { isAdmin, session } = useAuth();
  const [accountCode, setAccountCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("volunteer");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryRequests, setRecoveryRequests] = useState<AccountRecoveryRequest[]>([]);
  const [selectedRecoveryRequestId, setSelectedRecoveryRequestId] = useState("");
  const [selectedRecoveryUserId, setSelectedRecoveryUserId] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetIsError, setResetIsError] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingResets, setIsLoadingResets] = useState(true);
  const [emailUserId, setEmailUserId] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailIsError, setEmailIsError] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [activatingUserId, setActivatingUserId] = useState("");
  const [activationMessage, setActivationMessage] = useState("");
  const [activationIsError, setActivationIsError] = useState(false);

  const loadResetRequests = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const [resetResponse, adminResponse] = await Promise.all([
        fetch("/api/admin/password-resets", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);
      const [resetData, adminData] = await Promise.all([
        resetResponse.json().catch(() => null),
        adminResponse.json().catch(() => null),
      ]);
      if (!resetResponse.ok) {
        throw new Error(resetData?.error || "無法讀取密碼重設申請。");
      }
      if (!adminResponse.ok) {
        throw new Error(adminData?.error || "無法確認管理員安全狀態。");
      }
      setRecoveryRequests(Array.isArray(resetData?.requests) ? resetData.requests : []);
      setAdminCount(Number(adminData?.adminCount ?? 0));
      setRegisteredUsers(Array.isArray(adminData?.users) ? adminData.users : []);
    } catch (error) {
      setResetIsError(true);
      setResetMessage(error instanceof Error ? error.message : "無法讀取密碼重設申請。");
    } finally {
      setIsLoadingResets(false);
    }
  }, [isAdmin, session.access_token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadResetRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadResetRequests]);

  const activateCoordinator = async (userId: string) => {
    setActivatingUserId(userId);
    setActivationMessage("");
    setActivationIsError(false);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, action: "activate-coordinator" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "啟用帳號失敗。");

      setActivationMessage(
        `已啟用 ${data.user.displayName}（${data.user.accountCode}）為總招帳號。`
      );
      await loadResetRequests();
    } catch (error) {
      setActivationIsError(true);
      setActivationMessage(error instanceof Error ? error.message : "啟用帳號失敗。");
    } finally {
      setActivatingUserId("");
    }
  };

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

  const normalizeName = (value: string) =>
    value.normalize("NFKC").replace(/\s+/g, " ").trim();

  const selectRecoveryRequest = (request: AccountRecoveryRequest) => {
    setSelectedRecoveryRequestId(request.requestLogId);
    setResetMessage("");
    setResetIsError(false);
    const matches = registeredUsers.filter(
      (user) => user.isActive && normalizeName(user.displayName) === normalizeName(request.requestedName)
    );
    setSelectedRecoveryUserId(matches.length === 1 ? matches[0].id : "");
  };

  const saveRecoveryEmail = async (event: FormEvent) => {
    event.preventDefault();
    setEmailMessage("");
    setEmailIsError(false);
    if (!emailUserId) {
      setEmailIsError(true);
      setEmailMessage("請先選擇帳號。");
      return;
    }

    setIsSavingEmail(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: emailUserId,
          action: "update-recovery-email",
          contactEmail: emailDraft,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "儲存救援 Email 失敗。");
      setEmailMessage(`已更新 ${data.user.displayName} 的救援 Email。`);
      await loadResetRequests();
    } catch (error) {
      setEmailIsError(true);
      setEmailMessage(error instanceof Error ? error.message : "儲存救援 Email 失敗。");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleAccountRecovery = async (event: FormEvent) => {
    event.preventDefault();
    setResetMessage("");
    setResetIsError(false);

    if (!selectedRecoveryRequestId || !selectedRecoveryUserId) {
      setResetIsError(true);
      setResetMessage("請先選擇申請，並確認本人對應的服事帳號。");
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch("/api/admin/password-resets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestLogId: selectedRecoveryRequestId,
          userId: selectedRecoveryUserId,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "帳號／密碼協助處理失敗。");

      setResetMessage(
        `已確認 ${data.delivery.displayName}，系統已將原服事帳號與臨時密碼寄到 ${data.delivery.emailMasked}。`
      );
      setSelectedRecoveryRequestId("");
      setSelectedRecoveryUserId("");
      await loadResetRequests();
    } catch (error) {
      setResetIsError(true);
      setResetMessage(error instanceof Error ? error.message : "帳號／密碼協助處理失敗。");
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
        body: JSON.stringify({ accountCode, displayName, contactEmail, password, role }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "建立帳號失敗。");

      setIsError(false);
      setMessage(`已建立 ${data.user.displayName}（${data.user.accountCode}）。`);
      setAccountCode("");
      setDisplayName("");
      setContactEmail("");
      setPassword("");
      setRole("volunteer");
      await loadResetRequests();
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
        {adminCount !== null && adminCount <= 1 && (
          <section className="mb-6 rounded-[24px] border border-[#E3A008]/30 bg-[#FFF8E1] p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#A66B00]" />
              <div>
                <h1 className="text-base font-black text-[#6A4700]">目前只有 1 位管理員</h1>
                <p className="mt-1 text-sm font-bold leading-6 text-[#7A5A12]">
                  如果唯一管理員在所有裝置都登出又忘記密碼，App 內將沒有人能批准重設。建議建立第 2 位可信任的備援管理員。
                </p>
                <button
                  type="button"
                  onClick={() => setRole("admin")}
                  className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#8A5D00] shadow-sm"
                >
                  下方建立備援管理員
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="mb-6 rounded-[28px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-[#1F2937]">待處理帳號／密碼協助</h1>
              <p className="mt-1 text-sm font-medium leading-6 text-[#7B7B74]">
                申請人只填姓名。請確認本人並選對既有帳號；按確認後系統會自動寄出原帳號與新的臨時密碼。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLoadingResets(true);
                void loadResetRequests();
              }}
              disabled={isLoadingResets}
              aria-label="重新整理帳號／密碼協助申請"
              className="rounded-xl border border-[#6D55A3]/15 bg-[#F3EEFF] p-2 text-[#6D55A3] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingResets ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {recoveryRequests.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9F3] px-4 py-4 text-sm font-bold text-[#7B7B74]">
                目前沒有待處理的帳號／密碼協助申請。
              </div>
            ) : (
              recoveryRequests.map((request) => (
                <div key={request.requestLogId} className="rounded-2xl border border-[#E6EAF0] p-4">
                  <div className="font-black text-[#1F2937]">{request.requestedName}</div>
                  <div className="mt-1 text-xs font-medium text-[#7B7B74]">
                    申請時間：{new Date(request.requestedAt).toLocaleString("zh-TW")}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectRecoveryRequest(request)}
                    className="mt-3 rounded-xl bg-[#F3EEFF] px-3 py-2 text-xs font-black text-[#6D55A3]"
                  >
                    處理這份申請
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <form onSubmit={saveRecoveryEmail} className="mb-6 rounded-[28px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
          <h2 className="text-xl font-black text-[#1F2937]">救援 Email 管理</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-[#7B7B74]">
            既有帳號若尚未設定 Email，請先在這裡補上。Email 只供帳號救援使用，不顯示給一般同工。
          </p>
          <select
            value={emailUserId}
            onChange={(event) => {
              const id = event.target.value;
              setEmailUserId(id);
              setEmailDraft(registeredUsers.find((user) => user.id === id)?.contactEmail || "");
              setEmailMessage("");
            }}
            className="mt-4 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3"
            required
          >
            <option value="">請選擇帳號</option>
            {registeredUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}（{user.accountCode}）{user.contactEmail ? "" : "｜未設定 Email"}
              </option>
            ))}
          </select>
          <input
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(event) => setEmailDraft(event.target.value)}
            placeholder="name@example.com"
            className="mt-3 w-full rounded-2xl border border-[#D9DEE7] px-4 py-3 outline-none focus:border-[#6D55A3]"
            required
          />
          {emailMessage && (
            <p className={`mt-3 text-sm font-bold ${emailIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>
              {emailMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={isSavingEmail}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D55A3] px-4 py-3 font-black text-white disabled:opacity-60"
          >
            {isSavingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSavingEmail ? "儲存中" : "儲存救援 Email"}
          </button>
        </form>

        <section className="mb-6 rounded-[28px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#1F2937]">待啟用註冊帳號</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-[#7B7B74]">
                自行註冊的帳號會自動出現在這裡。確認本人後，一鍵啟用為總招帳號。
              </p>
            </div>
            <UserCheck className="h-5 w-5 shrink-0 text-[#6D55A3]" />
          </div>

          {activationMessage && (
            <p role="status" className={`mt-4 text-sm font-bold ${activationIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>
              {activationMessage}
            </p>
          )}

          <div className="mt-4 space-y-3">
            {registeredUsers.filter((user) => !user.isActive && user.roles.length === 0).length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9F3] px-4 py-4 text-sm font-bold text-[#7B7B74]">
                目前沒有待啟用的自行註冊帳號。
              </div>
            ) : (
              registeredUsers
                .filter((user) => !user.isActive && user.roles.length === 0)
                .map((user) => (
                  <div key={user.id} className="rounded-2xl border border-[#E6EAF0] p-4">
                    <div className="font-black text-[#1F2937]">{user.displayName}</div>
                    <div className="mt-1 text-sm font-bold text-[#6D55A3]">{user.accountCode}</div>
                    <button
                      type="button"
                      onClick={() => void activateCoordinator(user.id)}
                      disabled={activatingUserId === user.id}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D55A3] px-3 py-2.5 text-sm font-black text-white disabled:opacity-60"
                    >
                      {activatingUserId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                      {activatingUserId === user.id ? "啟用中" : "啟用為總招帳號"}
                    </button>
                  </div>
                ))
            )}
          </div>
        </section>

        <form onSubmit={handleAccountRecovery} className="mb-6 rounded-[28px] border border-[#6D55A3]/15 bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-6">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#1F2937]">
              <KeyRound className="h-5 w-5 text-[#6D55A3]" />
              確認並寄送登入資料
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#7B7B74]">
              從上方選擇申請後，確認本人對應的服事帳號。按一次確認，系統會產生新的臨時密碼並自動寄到該帳號登記的 Email；原服事帳號不變。
            </p>
          </div>

          {selectedRecoveryRequestId ? (
            <div className="rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold text-[#1F2937]">
              申請姓名：{
                recoveryRequests.find((request) => request.requestLogId === selectedRecoveryRequestId)?.requestedName || "未指定"
              }
            </div>
          ) : (
            <div className="rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold text-[#7B7B74]">
              請先從上方選擇一份申請。
            </div>
          )}

          <select
            value={selectedRecoveryUserId}
            onChange={(event) => setSelectedRecoveryUserId(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3"
            required
          >
            <option value="">確認本人對應的已啟用帳號</option>
            {registeredUsers
              .filter((user) => user.isActive)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}（{user.accountCode}）{user.contactEmail ? "" : "｜未設定 Email"}
                </option>
              ))}
          </select>

          {resetMessage && (
            <p role="status" className={`mt-4 text-sm font-bold ${resetIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}>
              {resetMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isResetting || !selectedRecoveryRequestId || !selectedRecoveryUserId}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-40"
          >
            {isResetting ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
            {isResetting ? "處理中" : "確認本人並寄送登入資料"}
          </button>
        </form>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-[#E6EAF0] bg-white p-7 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-6">
            <h1 className="text-2xl font-black text-[#1F2937]">建立服事帳號</h1>
            <p className="mt-2 text-sm font-medium text-[#7B7B74]">帳號由管理員建立；系統不寄信，也不要求同工提供電子郵件。</p>
          </div>

          <Field label="姓名" value={displayName} onChange={setDisplayName} autoComplete="name" />
          <Field label="聯絡 Email" value={contactEmail} onChange={setContactEmail} type="email" autoComplete="email" hint="只供帳號救援寄送登入資料使用" />
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
