import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    vi.stubEnv('MCP_AUTH_TOKEN', 'test-token');
    vi.stubEnv('PORT', '3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads all config from env vars', () => {
    vi.stubEnv('PUBLIC_URL', 'http://example.com');
    const config = loadConfig();
    expect(config.supabaseUrl).toBe('http://localhost:54321');
    expect(config.supabaseServiceRoleKey).toBe('test-key');
    expect(config.port).toBe(3000);
    expect(config.publicUrl).toBe('http://example.com');
  });

  it('uses default port 8080 when PORT is not set', () => {
    vi.stubEnv('PORT', '');
    delete process.env['PORT'];
    const config = loadConfig();
    expect(config.port).toBe(8080);
    expect(config.publicUrl).toBe('http://localhost:8080');
  });

  it('uses default publicUrl when PUBLIC_URL is not set', () => {
    delete process.env['PUBLIC_URL'];
    const config = loadConfig();
    expect(config.publicUrl).toBe('http://localhost:3000');
  });

  it('throws when SUPABASE_URL is missing', () => {
    delete process.env['SUPABASE_URL'];
    expect(() => loadConfig()).toThrow('Missing required environment variable: SUPABASE_URL');
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
    expect(() => loadConfig()).toThrow(
      'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  it('throws when PORT is not a valid number', () => {
    vi.stubEnv('PORT', 'abc');
    expect(() => loadConfig()).toThrow('PORT must be a valid port number');
  });

  it('throws when PORT exceeds range', () => {
    vi.stubEnv('PORT', '99999');
    expect(() => loadConfig()).toThrow('PORT must be a valid port number');
  });
});
