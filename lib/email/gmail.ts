import "server-only";

import { randomUUID } from "node:crypto";
import { connect, type TLSSocket } from "node:tls";
import { isValidContactEmail, normalizeContactEmail } from "@/lib/auth/password-reset";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 8_000;

// Personal Gmail currently permits up to 500 outgoing messages per day.
// Keep account recovery far below that so this feature cannot consume the
// sender's normal personal-mail allowance by itself.
export const ACCOUNT_RECOVERY_EMAIL_DAILY_LIMIT = 50;

type ResponseWaiter = {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
};

function createResponseReader(socket: TLSSocket) {
  let buffer = "";
  let current: string[] = [];
  const queued: string[] = [];
  const waiters: ResponseWaiter[] = [];
  let terminalError: Error | null = null;

  const fail = (error: Error) => {
    terminalError = error;
    while (waiters.length) waiters.shift()?.reject(error);
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\r\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 2);
      current.push(line);

      if (/^\d{3} /.test(line)) {
        const response = current.join("\n");
        current = [];
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(response);
        else queued.push(response);
      }

      newlineIndex = buffer.indexOf("\r\n");
    }
  });

  socket.on("error", (error) => fail(error));
  socket.on("timeout", () => {
    const error = new Error("Gmail SMTP timed out.");
    fail(error);
    socket.destroy(error);
  });
  socket.on("close", () => {
    if (waiters.length && !terminalError) {
      fail(new Error("Gmail SMTP connection closed unexpectedly."));
    }
  });

  return function readResponse() {
    if (queued.length) return Promise.resolve(queued.shift() as string);
    if (terminalError) return Promise.reject(terminalError);
    return new Promise<string>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  };
}

function responseCode(response: string) {
  return Number(response.slice(0, 3));
}

function assertCode(response: string, allowed: number[]) {
  const code = responseCode(response);
  if (!allowed.includes(code)) {
    throw new Error(`Unexpected Gmail SMTP response: ${code || "unknown"}`);
  }
}

function encodeHeader(value: string) {
  const safe = value.replace(/[\r\n]+/g, " ").trim();
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function dotStuff(value: string) {
  return value
    .replace(/\r?\n/g, "\r\n")
    .replace(/(^|\r\n)\./g, "$1..");
}

async function writeCommand(
  socket: TLSSocket,
  readResponse: () => Promise<string>,
  command: string,
  expectedCodes: number[]
) {
  socket.write(`${command}\r\n`);
  const response = await readResponse();
  assertCode(response, expectedCodes);
  return response;
}

export async function sendAccountRecoveryEmail({
  toEmail,
  accountCode,
  temporaryPassword,
}: {
  toEmail: string;
  accountCode: string;
  temporaryPassword: string;
}) {
  const smtpUser = normalizeContactEmail(process.env.GMAIL_SMTP_USER);
  const appPassword = String(process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  const senderName = String(process.env.GMAIL_SENDER_NAME ?? "夏凱納招待服事").trim();
  const recipient = normalizeContactEmail(toEmail);

  if (
    !isValidContactEmail(smtpUser)
    || !isValidContactEmail(recipient)
    || appPassword.length !== 16
  ) {
    throw new Error("Gmail SMTP is not configured.");
  }

  const socket = connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
    rejectUnauthorized: true,
  });
  socket.setTimeout(SMTP_TIMEOUT_MS);
  const readResponse = createResponseReader(socket);

  try {
    await new Promise<void>((resolve, reject) => {
      if (socket.authorized) {
        resolve();
        return;
      }
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
    });

    const greeting = await readResponse();
    assertCode(greeting, [220]);

    await writeCommand(socket, readResponse, "EHLO servant-timeline.vercel.app", [250]);
    await writeCommand(socket, readResponse, "AUTH LOGIN", [334]);
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(smtpUser, "utf8").toString("base64"),
      [334]
    );
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(appPassword, "utf8").toString("base64"),
      [235]
    );
    await writeCommand(socket, readResponse, `MAIL FROM:<${smtpUser}>`, [250]);
    await writeCommand(socket, readResponse, `RCPT TO:<${recipient}>`, [250, 251]);
    await writeCommand(socket, readResponse, "DATA", [354]);

    const messageId = `<${randomUUID()}@servant-timeline.vercel.app>`;
    const subject = "夏凱納招待服事｜帳號協助完成";
    const textContent = [
      "夏凱納招待服事｜帳號協助完成",
      "",
      "管理員已確認你的帳號協助申請。",
      `服事帳號：${accountCode}`,
      `臨時密碼：${temporaryPassword}`,
      "",
      "請使用以上資料登入。登入後系統會要求你立即設定自己的新密碼。",
      "若你沒有提出這項申請，請直接聯絡管理員。",
    ].join("\r\n");

    const message = [
      `From: ${encodeHeader(senderName || "夏凱納招待服事")} <${smtpUser}>`,
      `To: <${recipient}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      dotStuff(textContent),
    ].join("\r\n");

    socket.write(`${message}\r\n.\r\n`);
    const accepted = await readResponse();
    assertCode(accepted, [250]);

    await writeCommand(socket, readResponse, "QUIT", [221]).catch(() => undefined);
    return { messageId };
  } finally {
    socket.end();
    socket.destroy();
  }
}
