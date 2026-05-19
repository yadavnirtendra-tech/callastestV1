// ============================================================
// Enterprise Calendar Sync — Health Check Route
// ============================================================

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database/client';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();

  const health = {
    status: dbHealth.status === 'up' ? 'healthy' : 'unhealthy',
    version: '1.0.0',
    uptime: process.uptime(),
    services: {
      database: { status: dbHealth.status, latency: dbHealth.latency, lastChecked: new Date().toISOString() },
    },
    timestamp: new Date().toISOString(),
  };

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

export default router;
