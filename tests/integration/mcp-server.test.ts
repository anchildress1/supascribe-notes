import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';

// Mock Supabase client
vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockImplementation(async (token) => {
        if (token === 'valid-token') {
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
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
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
  }),
}));

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
  port: 0,
  publicUrl: 'http://localhost:0',
};

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  Authorization: 'Bearer valid-token',
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
    const res = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: 'Bearer test-auth-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns 401 without auth token', async () => {
    // /status is public, so we use /mcp or a non-existent route that falls through to auth
    const res = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /mcp with initialize request creates session', async () => {
    const initPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify(initPayload),
    });

    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
  });

  it('POST /mcp without session or initialize returns 400', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(400);
  });

  it('full MCP flow: initialize → list tools → call health', async () => {
    // Helper to parse MCP response (may be JSON or SSE)
    async function parseMcpResponse(res: Response) {
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream')) {
        const text = await res.text();
        const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
        const lastData = dataLines[dataLines.length - 1];
        return JSON.parse(lastData.slice('data: '.length));
      }
      return res.json();
    }

    // Step 1: Initialize
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
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

    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    // Step 2: Send initialized notification
    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...MCP_HEADERS, 'mcp-session-id': sessionId! },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // Step 3: List tools
    const listRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...MCP_HEADERS, 'mcp-session-id': sessionId! },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(listRes.status).toBe(200);
    const listBody = await parseMcpResponse(listRes);
    const toolNames = listBody.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('health');
    expect(toolNames).toContain('write_cards');

    // Step 4: Call health tool
    const healthRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...MCP_HEADERS, 'mcp-session-id': sessionId! },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'health', arguments: {} },
      }),
    });

    expect(healthRes.status).toBe(200);
    const healthBody = await parseMcpResponse(healthRes);
    const content = JSON.parse(healthBody.result.content[0].text);
    expect(content.status).toBeDefined();
  });
});
