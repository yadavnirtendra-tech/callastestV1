// ============================================================
// Enterprise Calendar Sync — Auth Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import bcrypt from 'bcryptjs';
import config from '../config';
import getDatabase from '../database/client';
import { encrypt } from '../crypto/encryption';
import { generateJWT, optionalAuth, authenticateToken } from '../middleware/auth';
import { logAuditEvent } from '../audit/logger';
import { authLogger } from '../utils/logger';
import { AuditAction, AuditResourceType, AuditSource } from '../types';
import { authRateLimiter } from '../middleware/security';
import { watchGoogleCalendar, stopGoogleWatch } from '../connectors/google/calendar';
import { createMicrosoftSubscription, deleteMicrosoftSubscription } from '../connectors/microsoft/calendar';

const router = Router();

// ---- Google OAuth ----

const googleOAuth = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

/** Redirect user to Google consent screen */
router.get('/google', authRateLimiter, (_req: Request, res: Response) => {
  const authUrl = googleOAuth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...config.google.scopes],
  });
  res.redirect(authUrl);
});

/** Handle Google OAuth callback */
router.get('/google/callback', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, error: { code: 'MISSING_CODE', message: 'Authorization code missing' } });
      return;
    }

    const { tokens } = await googleOAuth.getToken(code);
    googleOAuth.setCredentials(tokens);

    // Get user info
    const oauth2 = (await import('googleapis')).google.oauth2({ version: 'v2', auth: googleOAuth });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email!;
    const name = userInfo.data.name || email;

    const db = getDatabase();

    let user;
    if (req.user) {
      // User is logged in, link calendar to this user
      user = await db.user.update({
        where: { id: req.user.sub },
        data: {
          googleAccessToken: encrypt(tokens.access_token!),
          googleRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          googleTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          googleConnected: true,
        },
      });
    } else {
      // Upsert user — default behavior when signing in with Google from login page
      user = await db.user.upsert({
        where: { email },
        update: {
          googleAccessToken: encrypt(tokens.access_token!),
          googleRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          googleTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          googleConnected: true,
          displayName: name,
        },
        create: {
          email,
          displayName: name,
          role: 'USER',
          googleAccessToken: encrypt(tokens.access_token!),
          googleRefreshToken: encrypt(tokens.refresh_token || ''),
          googleTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          googleConnected: true,
          isActive: true,
        },
      });
    }

    // Initialize Google Calendar record in DB
    let calName = 'Google Calendar';
    let calTimezone = 'UTC';
    try {
      const calendarService = (await import('googleapis')).google.calendar({ version: 'v3', auth: googleOAuth });
      const primaryCalRes = await calendarService.calendars.get({ calendarId: 'primary' });
      calName = primaryCalRes.data.summary || 'Google Calendar';
      calTimezone = primaryCalRes.data.timeZone || 'UTC';
    } catch (err) {
      authLogger.warn({ userId: user.id, err }, 'Failed to fetch Google calendar metadata');
    }

    const calendarRecord = await db.calendar.upsert({
      where: {
        userId_provider_externalCalendarId: {
          userId: user.id,
          provider: 'GOOGLE',
          externalCalendarId: 'primary',
        },
      },
      update: {
        name: calName,
        timezone: calTimezone,
        syncEnabled: true,
      },
      create: {
        userId: user.id,
        provider: 'GOOGLE',
        externalCalendarId: 'primary',
        name: calName,
        timezone: calTimezone,
        isPrimary: true,
        syncEnabled: true,
      },
    });

    // Best-effort webhook watch setup
    try {
      const webhookUrl = config.webhook.googleUrl || `${config.webhook.baseUrl}/webhooks/google`;
      if (webhookUrl && !webhookUrl.includes('your-domain.com') && !webhookUrl.includes('localhost')) {
        const watch = await watchGoogleCalendar(user.id, 'primary', webhookUrl);
        await db.webhookSubscription.upsert({
          where: { channelId: watch.channelId },
          update: {
            expiresAt: watch.expiration,
            status: 'ACTIVE',
          },
          create: {
            calendarId: calendarRecord.id,
            provider: 'GOOGLE',
            channelId: watch.channelId,
            resourceId: watch.resourceId,
            webhookUrl,
            expiresAt: watch.expiration,
            status: 'ACTIVE',
          },
        });
      }
    } catch (err) {
      authLogger.warn({ userId: user.id, err }, 'Failed to set up Google webhook watch');
    }

    // Generate JWT
    const jwt = generateJWT({ id: user.id, email: user.email, role: user.role });

    // Audit log
    await logAuditEvent({
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      newValue: { provider: 'google', email },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    authLogger.info({ userId: user.id, email }, 'Google OAuth login successful');

    // Set secure cookie and redirect to dashboard
    res.cookie('token', jwt, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${config.adminDashboard.url}/dashboard?login=success&provider=google`);
  } catch (error) {
    authLogger.error({ error }, 'Google OAuth callback failed');
    res.redirect(`${config.adminDashboard.url}/login?error=google_auth_failed`);
  }
});

// ---- Microsoft OAuth ----

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: config.microsoft.clientId,
    clientSecret: config.microsoft.clientSecret,
    authority: config.microsoft.authority,
  },
});

/** Redirect user to Microsoft consent screen */
router.get('/microsoft', authRateLimiter, async (_req: Request, res: Response) => {
  const authUrl = await msalApp.getAuthCodeUrl({
    scopes: [...config.microsoft.scopes],
    redirectUri: config.microsoft.redirectUri,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

/** Handle Microsoft OAuth callback */
router.get('/microsoft/callback', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, error: { code: 'MISSING_CODE', message: 'Authorization code missing' } });
      return;
    }

    const result = await msalApp.acquireTokenByCode({
      code,
      scopes: [...config.microsoft.scopes],
      redirectUri: config.microsoft.redirectUri,
    });

    // Get user info from token claims
    const email = result.account?.username || '';
    const name = result.account?.name || email;

    const db = getDatabase();

    let microsoftRefreshToken: string | undefined = undefined;
    try {
      const cacheData = JSON.parse(msalApp.getTokenCache().serialize());
      const refreshTokenKeys = Object.keys(cacheData.RefreshToken || {});
      if (refreshTokenKeys.length > 0) {
        const rawRefreshToken = cacheData.RefreshToken[refreshTokenKeys[0]].secret;
        if (rawRefreshToken) {
          microsoftRefreshToken = encrypt(rawRefreshToken);
        }
      }
    } catch (err) {
      authLogger.warn({ err }, 'Failed to extract Microsoft refresh token from MSAL cache');
    }

    let user;
    if (req.user) {
      // User is logged in, link calendar to this user
      user = await db.user.update({
        where: { id: req.user.sub },
        data: {
          microsoftAccessToken: encrypt(result.accessToken),
          microsoftRefreshToken,
          microsoftTokenExpiresAt: result.expiresOn || null,
          microsoftConnected: true,
        },
      });
    } else {
      // Upsert user — default behavior when signing in with Microsoft from login page
      user = await db.user.upsert({
        where: { email },
        update: {
          microsoftAccessToken: encrypt(result.accessToken),
          microsoftRefreshToken,
          microsoftTokenExpiresAt: result.expiresOn || null,
          microsoftConnected: true,
          displayName: name,
        },
        create: {
          email,
          displayName: name,
          role: 'USER',
          microsoftAccessToken: encrypt(result.accessToken),
          microsoftRefreshToken: microsoftRefreshToken || '',
          microsoftTokenExpiresAt: result.expiresOn || null,
          microsoftConnected: true,
          isActive: true,
        },
      });
    }

    // Initialize Microsoft Calendar record in DB
    let msCalId = 'primary';
    let msCalName = 'Outlook Calendar';
    let msCalTimezone = 'UTC';
    try {
      const client = Client.init({
        authProvider: (done) => done(null, result.accessToken),
      });
      const msCal = await client.api('/me/calendar').get();
      msCalId = msCal.id || 'primary';
      msCalName = msCal.name || 'Outlook Calendar';
      msCalTimezone = msCal.browserMigrationSettings?.timezone || 'UTC';
    } catch (err) {
      authLogger.warn({ userId: user.id, err }, 'Failed to fetch Microsoft calendar metadata');
    }

    const calendarRecord = await db.calendar.upsert({
      where: {
        userId_provider_externalCalendarId: {
          userId: user.id,
          provider: 'MICROSOFT',
          externalCalendarId: msCalId,
        },
      },
      update: {
        name: msCalName,
        timezone: msCalTimezone,
        syncEnabled: true,
      },
      create: {
        userId: user.id,
        provider: 'MICROSOFT',
        externalCalendarId: msCalId,
        name: msCalName,
        timezone: msCalTimezone,
        isPrimary: true,
        syncEnabled: true,
      },
    });

    // Best-effort webhook watch setup
    try {
      const webhookUrl = config.webhook.microsoftUrl || `${config.webhook.baseUrl}/webhooks/microsoft`;
      if (webhookUrl && !webhookUrl.includes('your-domain.com') && !webhookUrl.includes('localhost')) {
        const watch = await createMicrosoftSubscription(user.id, msCalId, webhookUrl);
        await db.webhookSubscription.upsert({
          where: { channelId: watch.subscriptionId },
          update: {
            expiresAt: watch.expiration,
            status: 'ACTIVE',
          },
          create: {
            calendarId: calendarRecord.id,
            provider: 'MICROSOFT',
            channelId: watch.subscriptionId,
            webhookUrl,
            expiresAt: watch.expiration,
            status: 'ACTIVE',
          },
        });
      }
    } catch (err) {
      authLogger.warn({ userId: user.id, err }, 'Failed to set up Microsoft webhook subscription');
    }

    const jwt = generateJWT({ id: user.id, email: user.email, role: user.role });

    await logAuditEvent({
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      newValue: { provider: 'microsoft', email },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    authLogger.info({ userId: user.id, email }, 'Microsoft OAuth login successful');

    res.cookie('token', jwt, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${config.adminDashboard.url}/dashboard?login=success&provider=microsoft`);
  } catch (error) {
    authLogger.error({ error }, 'Microsoft OAuth callback failed');
    res.redirect(`${config.adminDashboard.url}/login?error=microsoft_auth_failed`);
  }
});

/** Local registration route */
router.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, password, and display name are required' },
      });
      return;
    }

    const db = getDatabase();
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        error: { code: 'USER_EXISTS', message: 'A user with this email already exists' },
      });
      return;
    }

    const salt = await bcrypt.genSalt(config.security.bcryptRounds || 12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        displayName,
        passwordHash,
        role: 'USER',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        googleConnected: true,
        microsoftConnected: true,
        isActive: true,
      },
    });

    const jwt = generateJWT({ id: user.id, email: user.email, role: user.role });

    await logAuditEvent({
      userId: user.id,
      action: AuditAction.USER_CREATED,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      newValue: { email: user.email },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.cookie('token', jwt, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ success: true, data: { user } });
  } catch (error) {
    authLogger.error({ error }, 'Local registration failed');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Registration failed due to a server error' },
    });
  }
});

/** Local login route */
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email and password are required' },
      });
      return;
    }

    const db = getDatabase();
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({
        success: false,
        error: { code: 'OAUTH_ONLY', message: 'This account was created using Google or Microsoft. Please sign in using your OAuth provider.' },
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    const jwt = generateJWT({ id: user.id, email: user.email, role: user.role });

    await logAuditEvent({
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      resourceType: AuditResourceType.USER,
      resourceId: user.id,
      newValue: { email: user.email },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.cookie('token', jwt, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          googleConnected: user.googleConnected,
          microsoftConnected: user.microsoftConnected,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    authLogger.error({ error }, 'Local login failed');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Login failed due to a server error' },
    });
  }
});

// ---- Session Management ----

router.get('/session', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.json({ success: true, data: { authenticated: false } });
      return;
    }

    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, config.jwt.secret) as any;
    const db = getDatabase();
    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true, email: true, displayName: true, role: true,
        googleConnected: true, microsoftConnected: true,
        lastSyncAt: true, isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.json({ success: true, data: { authenticated: false } });
      return;
    }

    res.json({ success: true, data: { authenticated: true, user } });
  } catch {
    res.json({ success: true, data: { authenticated: false } });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ success: true, data: { message: 'Logged out successfully' } });
});

/** Disconnect Google Calendar */
router.post('/disconnect/google', authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const db = getDatabase();

  try {
    const calendar = await db.calendar.findFirst({
      where: { userId, provider: 'GOOGLE', isPrimary: true },
      include: { webhookSubscriptions: true },
    });

    if (calendar) {
      // 1. Stop webhook subscriptions
      for (const sub of calendar.webhookSubscriptions) {
        try {
          await stopGoogleWatch(sub.channelId, sub.resourceId, userId);
        } catch (err) {
          authLogger.error({ userId, channelId: sub.channelId, err }, 'Failed to stop Google webhook watch during disconnect');
        }
      }

      // 2. Delete Calendar (Cascade deletes events and webhook subscriptions)
      await db.calendar.delete({
        where: { id: calendar.id },
      });
    }

    // 3. Clear Google OAuth tokens on User
    await db.user.update({
      where: { id: userId },
      data: {
        googleConnected: false,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
      },
    });

    // 4. Log Audit Event
    await logAuditEvent({
      userId,
      action: AuditAction.USER_UPDATED,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
      newValue: { provider: 'google', action: 'disconnect' },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.json({ success: true, data: { message: 'Google Calendar disconnected successfully' } });
  } catch (error) {
    authLogger.error({ userId, error }, 'Failed to disconnect Google Calendar');
    res.status(500).json({
      success: false,
      error: { code: 'DISCONNECT_FAILED', message: 'Failed to disconnect Google Calendar' },
    });
  }
});

/** Disconnect Microsoft Outlook Calendar */
router.post('/disconnect/microsoft', authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const db = getDatabase();

  try {
    const calendar = await db.calendar.findFirst({
      where: { userId, provider: 'MICROSOFT', isPrimary: true },
      include: { webhookSubscriptions: true },
    });

    if (calendar) {
      // 1. Stop webhook subscriptions
      for (const sub of calendar.webhookSubscriptions) {
        try {
          await deleteMicrosoftSubscription(userId, sub.channelId);
        } catch (err) {
          authLogger.error({ userId, subscriptionId: sub.channelId, err }, 'Failed to delete Microsoft subscription during disconnect');
        }
      }

      // 2. Delete Calendar (Cascade deletes events and webhook subscriptions)
      await db.calendar.delete({
        where: { id: calendar.id },
      });
    }

    // 3. Clear Microsoft OAuth tokens on User
    await db.user.update({
      where: { id: userId },
      data: {
        microsoftConnected: false,
        microsoftAccessToken: null,
        microsoftRefreshToken: null,
        microsoftTokenExpiresAt: null,
      },
    });

    // 4. Log Audit Event
    await logAuditEvent({
      userId,
      action: AuditAction.USER_UPDATED,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
      newValue: { provider: 'microsoft', action: 'disconnect' },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.json({ success: true, data: { message: 'Microsoft Calendar disconnected successfully' } });
  } catch (error) {
    authLogger.error({ userId, error }, 'Failed to disconnect Microsoft Calendar');
    res.status(500).json({
      success: false,
      error: { code: 'DISCONNECT_FAILED', message: 'Failed to disconnect Microsoft Calendar' },
    });
  }
});

export default router;
