// ============================================================
// Enterprise Calendar Sync — Structured Logger
// ============================================================
// Pino-based structured logging with context propagation.
// All logs are JSON in production, pretty-printed in dev.
// NEVER log sensitive data (tokens, passwords, PII).
// ============================================================

import pino from 'pino';
import config from '../config';

// Create the base logger
const logger = pino({
  level: config.logging.level,
  ...(config.isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  ...(!config.isDev && {
    // Production: JSON format for log aggregation
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
  // Redact sensitive fields from ALL log output
  redact: {
    paths: [
      'accessToken',
      'refreshToken',
      'password',
      'secret',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.accessToken',
      'body.refreshToken',
      'encryptionKey',
      '*.accessToken',
      '*.refreshToken',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with context (e.g., request ID, user ID).
 * Use this in request handlers and service methods.
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Specialized loggers for each subsystem
 */
export const syncLogger = logger.child({ service: 'sync-engine' });
export const authLogger = logger.child({ service: 'auth' });
export const conflictLogger = logger.child({ service: 'conflict-engine' });
export const webhookLogger = logger.child({ service: 'webhook' });
export const auditLogger = logger.child({ service: 'audit' });
export const notificationLogger = logger.child({ service: 'notification' });
export const securityLogger = logger.child({ service: 'security' });
export const dbLogger = logger.child({ service: 'database' });

export default logger;
