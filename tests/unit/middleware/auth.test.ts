import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../src/middleware/auth.js';
import type { SupabaseTokenVerifier } from '../../../src/lib/auth-provider.js';

describe('Auth Middleware', () => {
  let mockVerifier: SupabaseTokenVerifier;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockVerifier = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseTokenVerifier;

    mockReq = {
      headers: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    next = vi.fn();
  });

  it('returns 401 if missing Authorization header', async () => {
    const middleware = createAuthMiddleware(mockVerifier);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if token verification fails', async () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' };
    (mockVerifier.verifyAccessToken as Mock).mockRejectedValue(new Error('Invalid token'));

    const middleware = createAuthMiddleware(mockVerifier);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockVerifier.verifyAccessToken).toHaveBeenCalledWith('invalid-token');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if token is valid', async () => {
    mockReq.headers = { authorization: 'Bearer valid-token' };
    (mockVerifier.verifyAccessToken as Mock).mockResolvedValue({ userId: '123' });

    const middleware = createAuthMiddleware(mockVerifier);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockVerifier.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
