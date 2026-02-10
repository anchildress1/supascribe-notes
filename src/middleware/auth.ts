import type { Request, Response, NextFunction } from 'express';
import type { SupabaseTokenVerifier } from '../lib/auth-provider.js';
import { logger } from '../lib/logger.js';

export function createAuthMiddleware(authVerifier: SupabaseTokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Check OAuth Token
    try {
      await authVerifier.verifyAccessToken(token);
      next();
    } catch (error) {
      logger.warn({ error }, 'Authentication failed');
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
