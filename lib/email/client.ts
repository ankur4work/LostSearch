import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../env';
import { logger } from '../logger';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** `List-Unsubscribe` header value — RFC 8058 one-click format. */
  listUnsubscribe?: string;
  tags?: Record<string, string>;
}

/**
 * Unified email sender. Resend preferred (cheap + fast + good deliverability);
 * falls back to SMTP via Nodemailer if RESEND_API_KEY is unset. When BOTH are
 * unset we log + drop (dev/CI path).
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string; provider: string }> {
  const headers: Record<string, string> = {};
  if (input.listUnsubscribe) {
    headers['List-Unsubscribe'] = input.listUnsubscribe;
    // RFC 8058 signals to Gmail/Outlook that one-click unsubscribe is available.
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  if (env.RESEND_API_KEY) {
    const resend = new Resend(env.RESEND_API_KEY);
    const resp = await resend.emails.send({
      from: env.FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    });
    if (resp.error) {
      throw new Error(`Resend error: ${resp.error.message}`);
    }
    return { id: resp.data?.id ?? 'unknown', provider: 'resend' };
  }

  if (env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    });
    const info = await transport.sendMail({
      from: env.FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
    });
    return { id: info.messageId, provider: 'smtp' };
  }

  logger.warn(
    { to: input.to, subject: input.subject },
    'No email provider configured — dropping send (dev path)',
  );
  return { id: 'dropped', provider: 'dropped' };
}
