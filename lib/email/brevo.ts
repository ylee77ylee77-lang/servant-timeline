import "server-only";

import { isValidContactEmail, normalizeContactEmail } from "@/lib/auth/password-reset";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 6000;

export const ACCOUNT_RECOVERY_EMAIL_DAILY_LIMIT = 250;

export async function sendAccountRecoveryEmail({
  toEmail,
  accountCode,
  temporaryPassword,
}: {
  toEmail: string;
  accountCode: string;
  temporaryPassword: string;
}) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = normalizeContactEmail(process.env.BREVO_SENDER_EMAIL);
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "夏凱納招待服事";
  const recipient = normalizeContactEmail(toEmail);

  if (!apiKey || !isValidContactEmail(senderEmail) || !isValidContactEmail(recipient)) {
    throw new Error("Brevo email is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const textContent = [
    "夏凱納招待服事｜帳號協助完成",
    "",
    "管理員已確認你的帳號協助申請。",
    `服事帳號：${accountCode}`,
    `臨時密碼：${temporaryPassword}`,
    "",
    "請使用以上資料登入。登入後系統會要求你立即設定自己的新密碼。",
    "若你沒有提出這項申請，請直接聯絡管理員。",
  ].join("\n");

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipient }],
        subject: "夏凱納招待服事｜帳號協助完成",
        textContent,
        tags: ["account-recovery"],
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null) as { messageId?: string } | null;
    if (!response.ok || !payload?.messageId) {
      throw new Error("Brevo email send failed.");
    }

    return { messageId: payload.messageId };
  } finally {
    clearTimeout(timeout);
  }
}
