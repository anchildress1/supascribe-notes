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
  }),
}));

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
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

  it('GET /sse initiates SSE connection', async () => {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Cleanup - explicit close (though fetch doesn't keep streaming easily in node unless handled)
    // In node-fetch or native fetch, response body stream should be closed if not consumed fully
    if (res.body) {
      await res.body.cancel();
    }
  });

  it('full MCP flow: SSE handshake → initialize → list tools', async () => {
    // 1. Start SSE connection
    // We need to keep this open to receive responses
    const sseResponse = await fetch(`${baseUrl}/sse`, {
      headers: { Accept: 'text/event-stream' },
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
          if (buffer.trim()) {
            // Process remaining buffer if it looks like an event but no double newline?
            // Usually SSE ends with newline.
            // For now, if done and no newline, maybe incomplete or end?
            break;
          }
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

    const url = new URL(endpointUrl, baseUrl); // Construct full URL
    sessionId = url.searchParams.get('sessionId')!;
    expect(sessionId).toBeTruthy();

    // 3. Send Initialize Request
    const initRes = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    expect(initRes.status).toBe(202); // Accepted

    // 4. Expect Initialize Response via SSE
    // Depending on timing, might need to read multiple if there are keep-alives?
    // But standard MCP initialization response should come.
    // However, the test might receive nothing if I don't wait?
    // The previous readEvent consumed the endpoint event. Next should be the response.

    // Note: The server sends the response to transport.send(), which writes 'event: message\ndata: ...'
    // But `SSEServerTransport` might buffer? No, it writes directly.

    // Wait for response
    // Actually, `SSEServerTransport` sends `event: message` for JSON-RPC messages.
    // But wait, `initialize` response comes back.

    // 5. Send Initialized Notification
    await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
    expect(initRes.status).toBe(202);

    // 6. List Tools
    await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    // We should receive 2 messages: initialize result and tools/list result
    // (Assuming initialized notification doesn't trigger a response)

    // Let's read loop until we find tools/list result
    let foundTools = false;
    // We expect 2 responses (initialize, tools/list)
    // We might also get ping?

    for (let i = 0; i < 2; i++) {
      const msg = await readEvent();
      if (msg.event === 'message') {
        const json = JSON.parse(msg.data);
        if (json.id === 2 && json.result) {
          const tools = json.result.tools;
          expect(tools).toBeDefined();
          expect(tools.some((t: { name: string }) => t.name === 'write_cards')).toBe(true);
          foundTools = true;
          break;
        }
      }
    }

    expect(foundTools).toBe(true);

    // Close
    await reader.cancel();
  });
});
