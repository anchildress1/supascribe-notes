import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';
import { invokeApp, waitForNextTick } from '../helpers/http.js';

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
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp(testConfig);
  });

  it('GET /status returns 200 ok', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('GET / returns 200 and HTML help page', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res._getHeaders()['content-type']).toContain('text/html');
    const text = res._getData();
    expect(text).toContain('Supabase MCP Server');
    expect(text).toContain('<!DOCTYPE html>');
  });

  it('GET / redirects to /sse if Accept: text/event-stream', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/',
      headers: { accept: 'text/event-stream' },
    });
    expect(res.statusCode).toBe(307);
    expect(res._getHeaders().location).toBe('/sse');
  });

  it('GET /auth/authorize returns Consent UI', async () => {
    const { res } = await invokeApp(app, { method: 'GET', url: '/auth/authorize' });
    expect(res.statusCode).toBe(200);
    const text = res._getData();
    expect(text).toContain('Authorize Access');
    expect(text).toContain('External Application');
    expect(text).toContain('approve()');
    expect(text).toContain('deny()');
  });

  it('GET /sse/auth/authorize redirects to /auth/authorize', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/sse/auth/authorize?authorization_id=123',
    });
    expect(res.statusCode).toBe(302);
    expect(res._getHeaders().location).toBe('/auth/authorize?authorization_id=123');
  });

  it('GET /sse returns 401 without auth', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/sse',
      headers: { accept: 'text/event-stream' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /sse returns 401 with invalid auth', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/sse',
      headers: {
        accept: 'text/event-stream',
        authorization: 'Bearer invalid-token',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /.well-known/oauth-authorization-server returns metadata', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });
    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as {
      authorization_endpoint: string;
      token_endpoint: string;
    };
    expect(body.authorization_endpoint).toBe(`${testConfig.supabaseUrl}/auth/v1/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${testConfig.supabaseUrl}/auth/v1/oauth/token`);
  });

  it('GET /.well-known/oauth-protected-resource/sse returns specific metadata', async () => {
    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/.well-known/oauth-protected-resource/sse',
    });
    expect(res.statusCode).toBe(200);
    const body = res._getJSON() as { resource: string };
    expect(body.resource).toBe(testConfig.supabaseUrl);
  });

  it('GET /sse initiates SSE connection', async () => {
    const { res } = await invokeApp(
      app,
      {
        method: 'GET',
        url: '/sse',
        headers: {
          accept: 'text/event-stream',
          authorization: 'Bearer test-token',
        },
      },
      { waitForEnd: false },
    );

    await waitForNextTick();

    expect(res.statusCode).toBe(200);
    expect(res._getHeaders()['content-type']).toContain('text/event-stream');
    expect(res._getData()).toContain('event: endpoint');

    res.emit('close');
  });

  it('full MCP flow: SSE handshake → initialize → list tools', async () => {
    const { res: sseRes } = await invokeApp(
      app,
      {
        method: 'GET',
        url: '/sse',
        headers: {
          accept: 'text/event-stream',
          authorization: 'Bearer test-token',
        },
      },
      { waitForEnd: false },
    );

    const reader = (() => {
      let cursor = 0;
      return {
        async readEvent(): Promise<{ event: string; data: string }> {
          const timeoutAt = Date.now() + 1000;
          while (Date.now() < timeoutAt) {
            const available = sseRes._getData().slice(cursor);
            const delimiterIndex = available.indexOf('\n\n');
            if (delimiterIndex !== -1) {
              const messageBlock = available.slice(0, delimiterIndex);
              cursor += delimiterIndex + 2;
              const lines = messageBlock.split('\n');
              let event = '';
              let data = '';

              for (const line of lines) {
                if (line.startsWith('event: ')) event = line.slice(7);
                if (line.startsWith('data: ')) data = line.slice(6);
              }
              return { event, data };
            }
            await waitForNextTick();
          }
          throw new Error('Timed out waiting for SSE event');
        },
      };
    })();

    const endpointEvent = await reader.readEvent();
    expect(endpointEvent.event).toBe('endpoint');
    const endpointUrl = endpointEvent.data;
    expect(endpointUrl).toContain('/messages?sessionId=');

    const url = new URL(endpointUrl, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId')!;
    expect(sessionId).toBeTruthy();

    // 3. Send Initialize Request
    const initResult = await invokeApp(app, {
      method: 'POST',
      url: url.pathname + url.search,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
    });

    expect(initResult.res.statusCode).toBe(202);

    // 4. Expect 'message' event which contains the initialize result
    const initMessage = await reader.readEvent();
    expect(initMessage.event).toBe('message');
    const initData = JSON.parse(initMessage.data);
    expect(initData.result.protocolVersion).toBeDefined();

    // 5. Send Initialized Notification
    await invokeApp(app, {
      method: 'POST',
      url: url.pathname + url.search,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
    });

    // 5. List Tools
    await invokeApp(app, {
      method: 'POST',
      url: url.pathname + url.search,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
    });

    // Read events
    let foundTools = false;
    for (let i = 0; i < 2; i++) {
      const msg = await reader.readEvent();
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
    sseRes.emit('close');
  });

  it('POST /messages returns 404 for unknown session', async () => {
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/messages?sessionId=unknown-session-id',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      },
    });

    expect(res.statusCode).toBe(404);
    const text = res._getData();
    expect(text).toContain('Session not found');
  });
});
