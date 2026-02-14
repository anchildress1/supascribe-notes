import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';
import { invokeApp, waitForNextTick } from '../helpers/http.js';

const testConfig: Config = {
  supabaseUrl: 'http://localhost:54321',
  supabaseServiceRoleKey: 'test-key',
  supabaseAnonKey: 'anon-key',
  port: 0, // Random port
  publicUrl: 'http://localhost:0',
};

// Mock dependencies
vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(),
}));

vi.mock('../../src/lib/auth-provider.js', () => ({
  SupabaseTokenVerifier: vi.fn().mockImplementation(() => ({
    verifyAccessToken: vi.fn().mockResolvedValue({
      sub: 'test-user',
      email: 'test@example.com',
      role: 'authenticated',
    }),
  })),
}));

// Mock MCP Server
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn().mockImplementation(async (transport) => {
      await transport.start();
    }),
  })),
}));

// Mock SSEServerTransport
const mocks = vi.hoisted(() => {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    handlePostMessage: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => {
  return {
    SSEServerTransport: vi.fn().mockImplementation(() => ({
      start: mocks.start,
      handlePostMessage: mocks.handlePostMessage,
      sessionId: 'test-session',
      onclose: vi.fn(),
    })),
  };
});

describe('Server Error Handling', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = createApp(testConfig);
  });

  it('GET /sse initializes connection and calls start exactly once', async () => {
    // 1. Make start() a controlled promise so we can resolve it later
    let resolveStart: () => void;
    const startPromise = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    mocks.start.mockImplementation(() => startPromise);

    const { res } = await invokeApp(
      app,
      {
        method: 'GET',
        url: '/sse',
        headers: { authorization: 'Bearer token' },
      },
      { waitForEnd: false },
    );

    await waitForNextTick();

    // Verify start was called exactly once (via server.connect)
    expect(mocks.start).toHaveBeenCalledTimes(1);

    // Cleanup: resolve the hanging promise and abort the fetch
    resolveStart!();
    res.emit('close');
  });

  it('GET /sse returns 500 if transport start fails', async () => {
    mocks.start.mockRejectedValue(new Error('Failed to initialize session'));

    const { res } = await invokeApp(app, {
      method: 'GET',
      url: '/sse',
      headers: { authorization: 'Bearer token' },
    });

    expect(res.statusCode).toBe(500);
    expect(res._getHeaders()['content-type']).toBe('text/event-stream');
    const text = res._getData();
    expect(text).toContain('event: error');
    expect(text).toContain('"error":"Failed to initialize session"');
  });

  it('POST /messages returns 500 if handlePostMessage fails', async () => {
    // 1. Start success
    mocks.start.mockResolvedValue(undefined);

    // 2. Start SSE connection (wait for it to settle)
    const { res: sseRes } = await invokeApp(
      app,
      {
        method: 'GET',
        url: '/sse',
        headers: { authorization: 'Bearer token' },
      },
      { waitForEnd: false },
    );

    await waitForNextTick();

    // 3. Mock handlePostMessage failure
    mocks.handlePostMessage.mockRejectedValue(new Error('Handle failed'));

    // 4. Send POST message
    const { res } = await invokeApp(app, {
      method: 'POST',
      url: '/messages?sessionId=test-session',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token',
      },
      body: { jsonrpc: '2.0', method: 'ping' },
    });

    expect(res.statusCode).toBe(500);
    const body = res._getJSON() as { error: string };
    expect(body.error).toBe('Internal server error');

    sseRes.emit('close');
  });
});
