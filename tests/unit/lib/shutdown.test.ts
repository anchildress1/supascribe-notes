import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createShutdownHandler } from '../../../src/lib/shutdown.js';
import { logger } from '../../../src/lib/logger.js';

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('createShutdownHandler', () => {
  let mockServer: Server;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockServer = {
      close: vi.fn((cb) => cb()),
    } as unknown as Server;

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should close server and exit on signal', () => {
    const handler = createShutdownHandler(mockServer);
    handler('SIGTERM');

    expect(logger.info).toHaveBeenCalledWith({ signal: 'SIGTERM' }, 'Shutting down...');
    expect(mockServer.close).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Server closed');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should forcefully exit after timeout if server does not close', () => {
    // Mock server.close to NOT call its callback
    mockServer.close = vi.fn();

    const handler = createShutdownHandler(mockServer);
    handler('SIGTERM');

    expect(exitSpy).not.toHaveBeenCalled();

    // Fast-forward time
    vi.advanceTimersByTime(10000);

    expect(logger.error).toHaveBeenCalledWith(
      'Could not close connections in time, forcefully shutting down',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
