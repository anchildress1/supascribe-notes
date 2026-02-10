import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware } from '../../../src/middleware/auth.js';

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('createAuthMiddleware', () => {
  const middleware = createAuthMiddleware('test-token');

  it('calls next() when valid Bearer token is provided', () => {
    const req = { headers: { authorization: 'Bearer test-token' } } as Request;
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', () => {
    const req = { headers: {} } as Request;
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is wrong', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } } as Request;
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when format is not Bearer', () => {
    const req = { headers: { authorization: 'Basic test-token' } } as Request;
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when only token is provided without Bearer prefix', () => {
    const req = { headers: { authorization: 'test-token' } } as Request;
    const res = createMockRes();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
