export type RegistrationDraft = {
  displayName: string;
  accountCode: string;
  contactEmail: string;
  status: "pending" | "verified" | "verified_elsewhere" | "used_elsewhere" | "locked" | "expired";
  resendAt: string;
  expiresAt: string;
  resumeUntil: string | null;
};

export const REGISTRATION_PROGRESS_KEY = "shekinah_registration_pending_v1";

export function readRegistrationMailLink(href: string) {
  const url = new URL(href);
  const mode = url.searchParams.get("registration");
  const fragment = new URLSearchParams(url.hash.slice(1));
  const value = mode === "verify" ? fragment.get("token") : fragment.get("code");
  if (mode === "verify" && value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    return { mode, value } as const;
  }
  if (mode === "copy" && value && /^\d{6}$/.test(value)) {
    return { mode, value } as const;
  }
  return null;
}

export function cleanRegistrationMailLink(href: string) {
  const url = new URL(href);
  url.searchParams.delete("registration");
  url.hash = "";
  return url.pathname + url.search;
}

export function normalizeRegistrationCodeInput(value: string) {
  return value.normalize("NFKC").replace(/\D/g, "").slice(0, 6);
}
