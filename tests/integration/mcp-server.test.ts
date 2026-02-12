import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';

// Mock Supabase client
vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    auth: {
      getUser: vi.fn().mockImplementation(async (token) => {
        if (token === 'test-token') {
          return {
            data: {
              user: {
                id: 'test-user',
                email: 'test@example.com',
                role: 'authenticated',
              },
            },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: 'Invalid token' },
        };
      }),
    },
  }),
}));

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
  supabaseAnonKey: 'anon-key',
  port: 0,
  publicUrl: 'http://localhost:0',
};

describe('MCP Server Integration', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = createApp(testConfig);
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it('GET /status returns 200 ok', async () => {
    const res = await fetch(`${baseUrl}/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('GET / returns 200 and HTML help page', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('Supabase MCP Server');
    expect(text).toContain('<!DOCTYPE html>');
  });

  it('GET / redirects to /sse if Accept: text/event-stream', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: {
        Accept: 'text/event-stream',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/sse');
  });

  it('GET /auth/authorize returns Consent UI', async () => {
    const res = await fetch(`${baseUrl}/auth/authorize`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Authorize Access');
    expect(text).toContain('External Application');
    expect(text).toContain('approve()');
    expect(text).toContain('deny()');
  });

  it('GET /sse/auth/authorize redirects to /auth/authorize', async () => {
    const res = await fetch(`${baseUrl}/sse/auth/authorize?authorization_id=123`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/authorize?authorization_id=123');
  });

  it('GET /sse returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(401);
  });

  it('GET /sse returns 401 with invalid auth', async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer invalid-token',
      },
    });
    expect(res.status).toBe(401);
  });

  it('GET /.well-known/oauth-authorization-server returns metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
    };
    expect(body.authorization_endpoint).toBe(`${testConfig.supabaseUrl}/auth/v1/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${testConfig.supabaseUrl}/auth/v1/oauth/token`);
  });

  it('GET /.well-known/oauth-protected-resource/sse returns specific metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/sse`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resource: string };
    expect(body.resource).toBe(testConfig.supabaseUrl);
  });

  it('GET /sse initiates SSE connection', async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer test-token',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Cleanup
    if (res.body) {
      await res.body.cancel();
    }
  });

  it('full MCP flow: SSE handshake → initialize → list tools', async () => {
    // 1. Start SSE connection
    const sseResponse = await fetch(`${baseUrl}/sse`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer test-token',
      },
    });
    expect(sseResponse.status).toBe(200);

    if (!sseResponse.body) throw new Error('No response body');
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();

    let endpointUrl = '';
    let sessionId = '';
    let buffer = '';

    // Helper to read SSE events
    async function readEvent(): Promise<{ event: string; data: string }> {
      while (true) {
        if (buffer.includes('\n\n')) {
          const parts = buffer.split('\n\n');
          const messageBlock = parts[0];
          buffer = parts.slice(1).join('\n\n');

          const lines = messageBlock.split('\n');
          let event = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }

          return { event, data };
        }

        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) break;
          break;
        }
        buffer += decoder.decode(value, { stream: true });
      }
      throw new Error('Stream ended without event');
    }

    // 2. Expect 'endpoint' event
    const endpointEvent = await readEvent();
    expect(endpointEvent.event).toBe('endpoint');
    endpointUrl = endpointEvent.data;
    expect(endpointUrl).toContain('/messages?sessionId=');

    const url = new URL(endpointUrl, baseUrl);
    sessionId = url.searchParams.get('sessionId')!;
    expect(sessionId).toBeTruthy();

    // 3. Send Initialize Request
    const initRes = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    expect(initRes.status).toBe(202);

    // 4. Send Initialized Notification
    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // 5. List Tools
    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    // Read events
    let foundTools = false;
    for (let i = 0; i < 2; i++) {
      const msg = await readEvent();
      if (msg.event === 'message') {
        const json = JSON.parse(msg.data);
        if (json.id === 2 && json.result) {
          const tools = json.result.tools;
          expect(tools).toBeDefined();

          const writeTool = tools.find((t: { name: string }) => t.name === 'write_cards');
          expect(writeTool).toBeDefined();

          // Debug output for user verification
          console.log('--- DETECTED TOOL DEFINITION ---');
          console.log(JSON.stringify(writeTool, null, 2));

          // Verify schema structure per user request
          expect(writeTool.inputSchema).toBeDefined();
          expect(writeTool.inputSchema.type).toBe('object');
          expect(writeTool.inputSchema.properties).toBeDefined();
          expect(writeTool.inputSchema.properties.cards).toBeDefined();
          expect(writeTool.inputSchema.properties.cards.type).toBe('array');

          foundTools = true;
          break;
        }
      }
    }

    expect(foundTools).toBe(true);

    // Close
    await reader.cancel();
  });

  it('POST /messages returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/messages?sessionId=unknown-session-id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      }),
    });

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('Session not found');
  });
});
