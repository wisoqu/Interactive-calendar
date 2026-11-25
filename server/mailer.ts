import nodemailer from "nodemailer";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseSmtpPort(raw: string | undefined): number {
  const parsed = parseInt((raw || "587").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return 587;
  }
  return parsed;
}

export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(host && user && pass);
}

export async function sendResetEmail(
  toEmail: string,
  username: string,
  code: string,
  lang: "ru" | "en" = "ru"
): Promise<boolean> {
  if (!isSmtpConfigured()) {
    return false;
  }

  const host = process.env.SMTP_HOST!.trim();
  const port = parseSmtpPort(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const rawFrom = process.env.SMTP_FROM?.trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  // Avoid SMTP 553 sender-mismatch rejections on Gmail/Yandex/Mail.ru if SMTP_FROM is left as placeholder
  const defaultBrand = lang === "en" ? "School Calendar" : "Школьный календарь";
  const from =
    rawFrom && !rawFrom.includes("@example.com")
      ? rawFrom
      : `"${defaultBrand}" <${user}>`;

  const safeUsername = escapeHtml(username);
  const isEn = lang === "en";

  const subject = isEn
    ? "Password reset code — Interactive School Calendar"
    : "Код восстановления пароля — Интерактивный школьный календарь";

  const text = isEn
    ? `Hello, ${username}!\n\nYour 6-digit password reset code is: ${code}\nThis code is valid for 15 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.`
    : `Здравствуйте, ${username}!\n\nВаш 6-значный код для восстановления пароля: ${code}\nКод действителен в течение 15 минут.\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`;

  const html = isEn
    ? `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 24px; background-color: #f4f4f5; color: #18181b;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 2px solid #18181b; padding: 28px;">
          <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #18181b;">Password reset</h2>
          <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">Hello, <strong>${safeUsername}</strong>!</p>
          <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">Use this 6-digit verification code to set a new password in Interactive School Calendar:</p>
          <div style="background-color: #18181b; color: #ffffff; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">
            ${code}
          </div>
          <p style="margin: 16px 0 0 0; font-size: 12px; color: #71717a; line-height: 1.5;">This code expires in 15 minutes. If you did not request a password reset, please ignore this email.</p>
        </div>
      </div>
    `
    : `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 24px; background-color: #f4f4f5; color: #18181b;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 2px solid #18181b; padding: 28px;">
          <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #18181b;">Восстановление пароля</h2>
          <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">Здравствуйте, <strong>${safeUsername}</strong>!</p>
          <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">Используйте этот 6-значный код для установки нового пароля в приложении «Интерактивный школьный календарь»:</p>
          <div style="background-color: #18181b; color: #ffffff; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">
            ${code}
          </div>
          <p style="margin: 16px 0 0 0; font-size: 12px; color: #71717a; line-height: 1.5;">Код действителен в течение 15 минут. Если вы не запрашивали смену пароля, проигнорируйте это сообщение.</p>
        </div>
      </div>
    `;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html,
    });
    console.log(`[SMTP] Код восстановления отправлен на адрес ${toEmail}`);
    return true;
  } catch (err) {
    console.error("[SMTP ERROR] Не удалось отправить письмо через SMTP:", err);
    return false;
  } finally {
    transporter.close();
  }
}
