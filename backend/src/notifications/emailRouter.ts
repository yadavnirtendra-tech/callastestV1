// ============================================================
// Enterprise Calendar Sync — Smart Email Router
// ============================================================
// Routes outgoing emails through the right provider:
//
//   AUTO (default) — uses whichever platform the event came from:
//     Outlook event  → Microsoft Graph (sends from user's MS account)
//     Google event   → Gmail API       (sends from user's Gmail)
//
//   GOOGLE     — always Gmail API
//   MICROSOFT  — always Microsoft Graph
//   SENDGRID   — always SendGrid SMTP
//
// Users toggle their preference via the admin dashboard.
// ============================================================

import { notificationLogger } from '../utils/logger';
import { sendEmail } from './emailSender';
import { sendMicrosoftEmail } from '../connectors/microsoft/calendar';
import { getGoogleAuthClient } from '../connectors/google/calendar';
import getDatabase from '../database/client';
import { google } from 'googleapis';

export interface RoutedEmailPayload {
  userId: string;
  to: string;
  subject: string;
  html: string;
  /** The platform the triggering event came from — used when provider is AUTO */
  sourceProvider?: 'GOOGLE' | 'MICROSOFT';
}

/**
 * Send an email using the user's configured email provider.
 * Falls back to SendGrid SMTP if the preferred provider fails.
 */
export async function sendRoutedEmail(payload: RoutedEmailPayload): Promise<void> {
  const db = getDatabase();
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { emailProvider: true, email: true, googleConnected: true, microsoftConnected: true },
  });

  const preference = user?.emailProvider || 'AUTO';

  // Resolve which provider to actually use
  let resolved: 'GOOGLE' | 'MICROSOFT' | 'SENDGRID';

  if (preference === 'AUTO') {
    // Use the platform the event came from, fall back by connection status
    if (payload.sourceProvider === 'MICROSOFT' && user?.microsoftConnected) {
      resolved = 'MICROSOFT';
    } else if (payload.sourceProvider === 'GOOGLE' && user?.googleConnected) {
      resolved = 'GOOGLE';
    } else if (user?.microsoftConnected) {
      resolved = 'MICROSOFT';
    } else if (user?.googleConnected) {
      resolved = 'GOOGLE';
    } else {
      resolved = 'SENDGRID';
    }
  } else {
    resolved = preference as 'GOOGLE' | 'MICROSOFT' | 'SENDGRID';
  }

  notificationLogger.info(
    { userId: payload.userId, preference, resolved, to: payload.to },
    'Routing email via provider'
  );

  try {
    switch (resolved) {
      case 'GOOGLE':
        await sendViaGmail(payload);
        break;
      case 'MICROSOFT':
        await sendViaMicrosoftGraph(payload);
        break;
      case 'SENDGRID':
      default:
        await sendEmail({ to: payload.to, subject: payload.subject, html: payload.html });
        break;
    }
  } catch (err) {
    notificationLogger.warn(
      { userId: payload.userId, resolved, err },
      `${resolved} email failed — falling back to SendGrid SMTP`
    );
    // Always fall back to SMTP so the email is never lost
    await sendEmail({ to: payload.to, subject: payload.subject, html: payload.html });
  }
}

// ---- Gmail API Sender ----

async function sendViaGmail(payload: RoutedEmailPayload): Promise<void> {
  const auth = await getGoogleAuthClient(payload.userId);
  const gmail = google.gmail({ version: 'v1', auth });

  // Build RFC 2822 message
  const message = [
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    payload.html,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  notificationLogger.info({ to: payload.to }, 'Email sent via Gmail API');
}

// ---- Microsoft Graph Sender ----

async function sendViaMicrosoftGraph(payload: RoutedEmailPayload): Promise<void> {
  await sendMicrosoftEmail(
    payload.userId,
    payload.to,
    payload.subject,
    payload.html
  );
  notificationLogger.info({ to: payload.to }, 'Email sent via Microsoft Graph');
}
