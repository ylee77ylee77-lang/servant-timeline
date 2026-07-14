const ACCOUNT_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const AUTH_EMAIL_DOMAIN = "auth.servant-timeline.invalid";

export function normalizeAccountCode(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

export function isValidAccountCode(value: unknown) {
  return ACCOUNT_CODE_PATTERN.test(normalizeAccountCode(value));
}

export function accountCodeToInternalEmail(value: unknown) {
  const accountCode = normalizeAccountCode(value);

  if (!ACCOUNT_CODE_PATTERN.test(accountCode)) {
    throw new Error("服事帳號需為 3–32 字元，僅可使用英文小寫、數字、點、底線或連字號。");
  }

  return `${accountCode}@${AUTH_EMAIL_DOMAIN}`;
}
