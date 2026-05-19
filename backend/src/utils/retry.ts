// ============================================================
// Enterprise Calendar Sync — Retry & Backoff Utilities
// ============================================================

import logger from './logger';

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULTS: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt > opts.maxRetries) {
        logger.error({ err: lastError, label, attempt }, `All retries exhausted`);
        throw lastError;
      }
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1) + Math.random() * opts.baseDelayMs,
        opts.maxDelayMs
      );
      logger.warn({ label, attempt, delay: Math.round(delay) }, `Retry ${attempt}/${opts.maxRetries}`);
      await sleep(delay);
    }
  }
  throw lastError || new Error(`Retry failed: ${label}`);
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`[TIMEOUT] ${label} exceeded ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private threshold = 5, private resetMs = 60000, private label = 'service') {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetMs) {
        this.state = 'half-open';
      } else {
        throw new Error(`[CIRCUIT_BREAKER] ${this.label} is open`);
      }
    }
    try {
      const result = await fn();
      if (this.state === 'half-open') { this.state = 'closed'; this.failures = 0; }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.threshold) this.state = 'open';
      throw error;
    }
  }

  getState() { return { state: this.state, failures: this.failures }; }
}
