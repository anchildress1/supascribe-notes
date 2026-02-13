import { describe, it, expect } from 'vitest';
import { logger } from '../../../src/lib/logger.js';

describe('logger utility', () => {
  it('logger is initialized', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('can log a message without crashing', () => {
    expect(() => logger.info('test message')).not.toThrow();
  });
});
