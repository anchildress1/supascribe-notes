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
    const req = {
      method: 'GET',
      url: '/test',
      headers: {
        authorization: 'Bearer secrets',
        'user-agent': 'test-agent',
      },
    } as unknown as Request;
    const res = {
      on: vi.fn(),
      statusCode: 200,
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      {
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer secrets...[redacted]',
          'user-agent': 'test-agent',
          origin: undefined,
          referer: undefined,
          accept: undefined,
        },
      },
      'Incoming request',
    );
    expect(next).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));

    // Simulate finish event
    const finishCall = (res.on as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'finish',
    );
    if (!finishCall) {
      throw new Error('Finish handler was not registered on res.on');
    }
    const finishCallback = finishCall[1] as () => void;
    expect(typeof finishCallback).toBe('function');
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
