// ============================================================
// Enterprise Calendar Sync — Auth Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  googleConnected: boolean;
  microsoftConnected: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
}

/** Encrypted OAuth tokens stored in the database */
export interface EncryptedTokens {
  accessToken: string;  // AES-256-GCM encrypted
  refreshToken: string; // AES-256-GCM encrypted
  expiresAt: Date;
  scope: string;
  tokenType: string;
}

/** Decoded JWT payload */
export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/** OAuth callback result from Google/Microsoft */
export interface OAuthCallbackResult {
  provider: 'google' | 'microsoft';
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  idToken?: string;
}

/** Session data stored in secure cookie */
export interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  csrfToken: string;
  createdAt: number;
}

/** Login attempt for audit tracking */
export interface LoginAttempt {
  email: string;
  provider: 'google' | 'microsoft';
  success: boolean;
  ipAddress: string;
  userAgent: string;
  failureReason?: string;
  timestamp: Date;
}
