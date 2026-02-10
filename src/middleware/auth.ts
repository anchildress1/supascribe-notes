import type { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res
        .status(401)
        .json({ error: 'Invalid Authorization header format. Expected: Bearer <token>' });
      return;
    }

    if (parts[1] !== expectedToken) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    next();
  };
}
