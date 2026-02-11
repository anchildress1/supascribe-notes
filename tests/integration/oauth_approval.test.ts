import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';

// Mock Supabase client - Define implementation here (hoisting still applies)
vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: vi.fn().mockReturnValue({
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'test-user',
            email: 'test@example.com',
            role: 'authenticated',
          },
        },
        error: null,
      }),
    },
  }),
}));

const testConfig: Config = {
  supabaseUrl: 'http://mock-supabase.local',
  supabaseServiceRoleKey: 'test-key',
  supabaseAnonKey: 'anon-key',
  port: 0,
  mcpServerName: 'test-server',
  mcpServerVersion: '1.0.0',
  googleCloudProject: 'test-project',
  googleCloudRegion: 'us-central1',
  publicUrl: 'http://localhost:0',
};

describe('OAuth Approval Endpoint', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  const originalFetch = global.fetch;
  let fetchSpy: MockInstance;
  let serverPort: number;

  beforeAll(async () => {
    app = createApp(testConfig);
    server = app.listen(0);
    const address = server.address();
    serverPort = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://localhost:${serverPort}`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        let urlStr = '';
        if (typeof input === 'string') {
          urlStr = input;
        } else if (input instanceof URL) {
          urlStr = input.toString();
        } else if (typeof input === 'object' && input && 'url' in input) {
          urlStr = (input as Request).url;
        }

        // Pass through requests to our own test server
        if (
          urlStr.includes(`localhost:${serverPort}`) ||
          urlStr.includes(`127.0.0.1:${serverPort}`)
        ) {
          return originalFetch(input, init);
        }

        // Return mock success for Supabase calls (mock-supabase.local)
        if (urlStr.includes('mock-supabase.local')) {
          // Simulate error if authorization_id contains 'fail-auth'
          if (urlStr.includes('fail-auth')) {
            return Promise.resolve({
              ok: false,
              status: 400,
              json: async () => ({ error: { message: 'Supabase error' } }),
            } as Response);
          }
          // Simulate fetch error if authorization_id contains 'network-error'
          if (urlStr.includes('network-error')) {
            return Promise.reject(new Error('Network error'));
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              url: 'https://example.com/callback?code=mock',
              redirect_url: 'https://example.com/callback?code=mock',
            }),
          } as Response);
        }

        // Fallback for unexpected calls
        return Promise.reject(new Error(`Unexpected fetch call to ${urlStr}`));
      });
  });

  afterEach(() => {
    // Only restore fetch spy
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  it('POST /api/oauth/approve calls external API and returns redirect', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ authorization_id: 'auth-123' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_url: string };
    expect(body.redirect_url).toContain('example.com/callback');

    // Verify external call
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/oauth/authorizations/auth-123/consent'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          apikey: 'anon-key',
        }),
        body: JSON.stringify({ action: 'approve' }),
      }),
    );
  });

  it('POST /api/oauth/approve returns 500 on Supabase error', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ authorization_id: 'fail-auth' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Supabase error');
  });

  it('POST /api/oauth/approve returns 500 on Network error', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ authorization_id: 'network-error' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Network error');
  });

  it('POST /api/oauth/approve returns 400 when authorization_id is missing', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Missing authorization_id');
  });

  it('POST /api/oauth/deny calls external API and returns redirect', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/deny`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ authorization_id: 'auth-456' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_url: string };
    expect(body.redirect_url).toBeDefined();

    // Verify external call
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/oauth/authorizations/auth-456/consent'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'deny' }),
      }),
    );
  });

  it('POST /api/oauth/deny returns 400 when authorization_id is missing', async () => {
    const res = await fetch(`${baseUrl}/api/oauth/deny`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Missing authorization_id');
  });
});
