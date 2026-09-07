import 'server-only';

import nodemailer from 'nodemailer';

/**
 * 이메일 발송 (SMTP · nodemailer).
 * SMS(Solapi)와 동일하게 '환경변수 미설정 시 무발송(no-op)' 패턴으로 동작한다.
 * 아래 SMTP_* 환경변수가 설정되면 자동으로 이메일 알림이 활성화된다:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (SMTP_SECURE=true 면 465 TLS)
 */
export function emailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

export type EmailResult = { ok: true } | { ok: false; error: string };

let cachedTransport: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

/** 단건 이메일 발송. 미설정/실패 시 {ok:false} (호출부에서 삼켜서 다른 채널에 영향 없게). */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, error: 'email_not_configured' };
  const target = (to ?? '').trim();
  if (!target || !target.includes('@')) return { ok: false, error: 'invalid_email' };
  try {
    await transport().sendMail({
      from: process.env.SMTP_FROM,
      to: target,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send_failed' };
  }
}
