import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  logger.info(
    {
      method: req.method,
      url: req.url,
      headers: {
        authorization: req.headers.authorization
          ? `${req.headers.authorization.substring(0, 15)}...[redacted]`
          : undefined,
        'user-agent': req.headers['user-agent'],
        origin: req.headers.origin,
        referer: req.headers.referer,
        accept: req.headers.accept,
      },
    },
    'Incoming request',
  );

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
      },
      'Request completed',
    );
  });

  next();
}
