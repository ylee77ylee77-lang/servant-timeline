import { NextRequest } from "next/server";
import { isValidAccountCode, normalizeAccountCode } from "@/lib/auth/account-code";
import { isValidContactEmail, normalizeContactEmail } from "@/lib/auth/password-reset";
import {
  createRegistrationCode, createRegistrationToken, isRegistrationCode, isRegistrationToken,
  registrationCodeDigest, registrationDigest, registrationLink,
} from "@/lib/auth/registration-verification";
import {
  getRegistrationDraft, isRegistrationSameOrigin, readRegistrationSession,
  registrationMailOrigin, registrationResponse, writeRegistrationCookie,
} from "@/lib/auth/registration-verification-server";
import { sendRegistrationVerificationEmail } from "@/lib/email/gmail";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getRequestClientIp } from "@/lib/network/church-wifi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verificationError = "驗證連結或驗證碼已失效或使用，請確認原註冊介面的進度。";

export async function GET(request: NextRequest) {
  try {
    return registrationResponse({ draft: await getRegistrationDraft(readRegistrationSession(request)) });
  } catch {
    return registrationResponse({ error: "目前無法讀取註冊進度，請稍後再試。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isRegistrationSameOrigin(request)) return registrationResponse({ error: "請從註冊頁面操作。" }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    const sessionDigest = readRegistrationSession(request);
    const supabase = getSupabaseAdminClient();
    const action = String(body.action ?? "");
    if (action === "send") {
      const displayName = String(body.displayName ?? "").normalize("NFKC").trim();
      const accountCode = normalizeAccountCode(body.accountCode);
      const contactEmail = normalizeContactEmail(body.contactEmail);
      if (!displayName || displayName.length > 80 || !isValidAccountCode(accountCode) || !isValidContactEmail(contactEmail)) {
        return registrationResponse({ error: "請確認姓名、服事帳號與聯絡 Email 均已正確填寫。" }, 400);
      }
      const { data: existing, error: lookupError } = await supabase.from("profiles")
        .select("id").eq("account_code", accountCode).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return registrationResponse({ error: "這個服事帳號已被使用。" }, 409);
      const session = createRegistrationToken();
      const link = createRegistrationToken();
      const code = createRegistrationCode();
      const digest = registrationDigest(session);
      const secret = process.env.REGISTRATION_VERIFICATION_SECRET || "";
      const codeDigest = registrationCodeDigest(secret, digest, code);
      const ip = getRequestClientIp(request);
      const sourceDigest = ip ? registrationCodeDigest(secret, "source", ip) : "";
      const origin = registrationMailOrigin();
      const { data: result, error } = await supabase.rpc("registration_email_start", {
        p_old_session: sessionDigest, p_session: digest, p_link: registrationDigest(link),
        p_code: codeDigest, p_display_name: displayName, p_account_code: accountCode, p_contact_email: contactEmail,
        p_source: sourceDigest,
      });
      if (error) throw error;
      if (result !== "created") {
        return registrationResponse({ error: result === "cooldown"
          ? "請間隔 60 秒後再發送驗證信。"
          : "驗證信發送已達安全上限，請稍後再試。" }, 429);
      }
      try {
        await sendRegistrationVerificationEmail({
          toEmail: contactEmail, code,
          verifyUrl: registrationLink(origin, "verify", link),
        });
      } catch {
        await supabase.from("registration_email_challenges").update({ status: "invalidated" })
          .eq("session_digest", digest).eq("status", "pending");
        return registrationResponse({ error: "驗證信寄送失敗，請稍後重新發送。" }, 502);
      }
      return writeRegistrationCookie(registrationResponse({ draft: await getRegistrationDraft(digest) }), session);
    }
    if (action === "verify-code") {
      if (!sessionDigest || !isRegistrationCode(body.code)) return registrationResponse({ error: "請輸入六位數驗證碼。" }, 400);
      const digest = registrationCodeDigest(process.env.REGISTRATION_VERIFICATION_SECRET || "", sessionDigest, body.code);
      const first = await supabase.rpc("registration_email_verify_code", {
        p_session: sessionDigest, p_code: digest,
      });
      if (first.error) throw first.error;
      let result = first.data;
      if (result === "invalid") {
        const resume = await supabase.rpc("registration_email_resume", {
          p_session: sessionDigest, p_code: digest,
        });
        if (resume.error) throw resume.error;
        result = resume.data;
      }
      if (result !== "verified") {
        return registrationResponse({ error: result === "incorrect" ? "驗證碼錯誤，請重新輸入。"
          : result === "locked" ? "驗證碼錯誤已達 5 次，請重新發送。"
          : result === "resume_locked" ? "接續註冊的驗證碼錯誤已達 5 次，請在已驗證的網頁繼續。"
          : result === "resume_unavailable" ? "此介面已無法接續，請在持有註冊資格的介面繼續。"
          : verificationError,
          draft: await getRegistrationDraft(sessionDigest) }, 400);
      }
      return registrationResponse({ draft: await getRegistrationDraft(sessionDigest) });
    }
    if (action === "verify-link") {
      if (!isRegistrationToken(body.token)) return registrationResponse({ error: verificationError }, 400);
      const session = createRegistrationToken();
      const digest = registrationDigest(session);
      const { data: result, error } = await supabase.rpc("registration_email_verify_link", {
        p_link: registrationDigest(body.token), p_new_session: digest,
      });
      if (error) throw error;
      if (result !== "verified") return registrationResponse({ error: verificationError }, 400);
      return writeRegistrationCookie(registrationResponse({ draft: await getRegistrationDraft(digest) }), session);
    }
    if (action === "cancel") {
      if (sessionDigest) {
        const { error } = await supabase.from("registration_email_challenges")
          .update({ status: "invalidated" }).eq("session_digest", sessionDigest).in("status", ["pending", "verified", "locked"]);
        if (error) throw error;
      }
      return writeRegistrationCookie(registrationResponse({ draft: null }), "");
    }
    return registrationResponse({ error: "操作無效。" }, 400);
  } catch {
    return registrationResponse({ error: "目前無法完成電子郵件驗證，請稍後再試。" }, 503);
  }
}
