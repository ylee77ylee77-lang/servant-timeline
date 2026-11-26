export function registrationEmailContent({ code, verifyUrl, copyUrl }: {
  code: string;
  verifyUrl: string;
  copyUrl: string;
}) {
  // The URLs originate only from the server's trusted application origin.
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => entities[char] || char);
  const verify = escapeHtml(verifyUrl);
  const copy = escapeHtml(copyUrl);
  const otp = escapeHtml(code);
  const subject = "夏凱納招待服事｜電子郵件驗證";
  const textContent = [
    "夏凱納招待服事｜電子郵件驗證", "",
    "親愛的同工，您好！", "請點擊下方連結，完成電子郵件驗證。", verifyUrl, "",
    "或複製以下六位數驗證碼，返回註冊頁面貼上。", code,
    "複製驗證碼：" + copyUrl, "", "驗證有效期限為 10 分鐘。", "",
    "若您未申請驗證，請忽略此封信件。此為系統自動發送郵件，請勿直接回覆。",
  ].join("\r\n");
  const htmlContent = '<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#F5F6F6;font-family:Arial,Helvetica,sans-serif;color:#353B3B">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F6F6"><tr><td align="center" style="padding:24px 12px">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px">'
    + '<tr><td align="center" style="padding:8px 0 22px"><div style="color:#007D7D;font-size:20px;font-weight:bold;letter-spacing:3px">SHEKINAH</div><div style="font-size:13px;color:#7A7A73;margin-top:6px">夏凱納招待服事系統</div></td></tr>'
    + '<tr><td style="background:white;border:1px solid #E5E6E5;border-radius:22px;overflow:hidden">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="70%" height="5" bgcolor="#00B8B8"></td><td height="5" bgcolor="#785AA5"></td></tr>'
    + '<tr><td colspan="2" align="center" style="padding:30px 22px 28px">'
    + '<div style="display:inline-block;background:#E6F8F8;border-radius:50%;padding:19px 22px;font-size:28px;color:#007D7D">&#9993;</div>'
    + '<h1 style="font-size:23px;margin:18px 0 6px;line-height:1.4">驗證您的電子郵件</h1>'
    + '<div style="font-size:10px;letter-spacing:2px;color:#785AA5;font-weight:bold">EMAIL VERIFICATION</div>'
    + '<p style="font-size:14px;line-height:1.8;color:#62625C;margin:22px 0 20px">親愛的同工，您好！<br>請點擊下方按鈕，完成電子郵件驗證。</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#00B8B8" align="center" style="border-radius:12px"><a href="' + verify + '" style="display:block;padding:15px;color:#073B3B;text-decoration:none;font-size:16px;font-weight:bold">驗證電子郵件 &rarr;</a></td></tr></table>'
    + '<div style="margin:25px 0 16px;border-top:1px solid #E5E5E5;padding-top:16px;font-size:12px;color:#7A7A73">或使用驗證碼</div>'
    + '<p style="font-size:13px;line-height:1.7;color:#62625C;margin:0 0 12px">複製下方驗證碼，返回註冊頁面貼上。</p>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F3FA;border-radius:14px"><tr><td align="center" style="padding:20px 8px">'
    + '<div style="font-size:12px;font-weight:bold;color:#785AA5">您的專屬驗證碼</div>'
    + '<div style="font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;letter-spacing:7px;line-height:1.8;color:#785AA5;user-select:all">' + otp + '</div>'
    + '<a href="' + copy + '" style="display:inline-block;border:1px solid #785AA5;border-radius:24px;padding:9px 18px;font-size:13px;font-weight:bold;text-decoration:none;color:#785AA5">複製驗證碼</a>'
    + '</td></tr></table>'
    + '<p style="font-size:12px;color:#7A7A73;margin:18px 0 0">驗證有效期限為 10 分鐘</p>'
    + '</td></tr></table></td></tr>'
    + '<tr><td align="center" style="padding:22px 10px;color:#7A7A73;font-size:12px;line-height:1.8">若您未申請驗證，請忽略此封信件。<br>此為系統自動發送郵件，請勿直接回覆。<br><br><span style="font-size:11px;color:#785AA5">Shekinah Welcome Service</span></td></tr>'
    + '</table></td></tr></table></body></html>';
  return { subject, textContent, htmlContent };
}
