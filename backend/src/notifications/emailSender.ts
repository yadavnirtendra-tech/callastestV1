// ============================================================
// Enterprise Calendar Sync — Email Sender (nodemailer)
// ============================================================
// Sends actual emails via SMTP (Gmail, SendGrid, etc.)
// Called by the notification worker every 30 seconds.
// ============================================================

import nodemailer from 'nodemailer';
import config from '../config';
import { notificationLogger } from '../utils/logger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const { host, port, user, pass, from } = config.email;

  if (!host || !user || !pass) {
    throw new Error(
      'Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env file.'
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  notificationLogger.info({ host, port, user }, 'Email transporter initialized');
  return transporter;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const t = getTransporter();
  const from = config.email.from || config.email.user;

  await t.sendMail({
    from: `"CalendarSync Enterprise" <${from}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || stripHtml(payload.html),
  });

  notificationLogger.info({ to: payload.to, subject: payload.subject }, 'Email sent');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
