import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../src/middleware/auth.js';
import type { SupabaseTokenVerifier } from '../../../src/lib/auth-provider.js';

describe('Auth Middleware', () => {
  let mockVerifier: SupabaseTokenVerifier;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;
  const publicUrl = 'http://localhost:8080';

  beforeEach(() => {
    mockVerifier = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseTokenVerifier;

    mockReq = {
      headers: {},
      query: {},
      path: '/',
      originalUrl: '/',
      accepts: vi.fn().mockReturnValue(false), // Default to not accepting HTML
    } as unknown as Partial<Request>;

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      set: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
    } as unknown as Partial<Response>;

    next = vi.fn();
  });

  it('returns 401 if token is in query param but not header', async () => {
    mockReq.query = { token: 'valid-token' };
    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('prioritizes Authorization header over query params', async () => {
    mockReq.headers = { authorization: 'Bearer header-token' };
    mockReq.query = { token: 'query-token' };
    (mockVerifier.verifyAccessToken as Mock).mockResolvedValue({ userId: '123' });
    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockVerifier.verifyAccessToken).toHaveBeenCalledWith('header-token');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 HTML if missing Authorization header and accepts HTML', async () => {
    (mockReq.accepts as Mock).mockReturnValue('html');
    mockReq.path = '/some-page';
    mockReq.originalUrl = '/some-page';
    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockReq.accepts).toHaveBeenCalledWith('html');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.type).toHaveBeenCalledWith('text/html');
    expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('<!DOCTYPE html>'));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 text/plain for /sse even if accepting HTML', async () => {
    (mockReq.accepts as Mock).mockReturnValue('html');
    mockReq.path = '/sse';
    mockReq.originalUrl = '/sse';
    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.type).toHaveBeenCalledWith('text/plain');
    expect(mockRes.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/sse"`,
    );
    expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 text/plain if missing Authorization header and does not accept HTML', async () => {
    (mockReq.accepts as Mock).mockReturnValue(false);
    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.type).toHaveBeenCalledWith('text/plain');
    expect(mockRes.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`,
    );
    expect(mockRes.send).toHaveBeenCalledWith('Unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if token verification fails', async () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' };
    (mockVerifier.verifyAccessToken as Mock).mockRejectedValue(new Error('Invalid token'));

    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockVerifier.verifyAccessToken).toHaveBeenCalledWith('invalid-token');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.send).toHaveBeenCalledWith('Invalid token');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if token is valid', async () => {
    mockReq.headers = { authorization: 'Bearer valid-token' };
    (mockVerifier.verifyAccessToken as Mock).mockResolvedValue({ userId: '123' });

    const middleware = createAuthMiddleware(mockVerifier, publicUrl);

    await middleware(mockReq as Request, mockRes as Response, next);

    expect(mockVerifier.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
