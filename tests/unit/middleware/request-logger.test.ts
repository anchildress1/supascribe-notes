import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { logger } from '../../../src/lib/logger.js';

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe('requestLogger', () => {
  it('should log incoming request and completed request', () => {
    const req = { method: 'GET', url: '/test' } as Request;
    const res = {
      on: vi.fn(),
      statusCode: 200,
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith({ method: 'GET', url: '/test' }, 'Incoming request');
    expect(next).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

    // Simulate finish event
    const finishCallback = (res.on as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'finish',
    )?.[1];
    finishCallback();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/test',
        status: 200,
        duration: expect.any(Number),
      }),
      'Request completed',
    );
  });
});
