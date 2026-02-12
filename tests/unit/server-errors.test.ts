import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/server.js';
import type { Config } from '../../src/config.js';
import type { Server } from 'node:http';

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
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const app = createApp(testConfig);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
  });

  it('GET /sse initializes connection and calls start exactly once', async () => {
    // 1. Make start() hang so connection stays open and we can verify count
    mocks.start.mockImplementation(() => new Promise(() => {}));

    const _ssePromise = fetch(`${baseUrl}/sse`, {
      headers: {
        Authorization: 'Bearer token',
      },
    });

    // Give it a moment to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify start was called exactly once (via server.connect)
    expect(mocks.start).toHaveBeenCalledTimes(1);

    // We don't await response because it's hanging
  });

  it('GET /sse returns 500 if transport start fails', async () => {
    mocks.start.mockRejectedValue(new Error('Failed to initialize session'));

    const res = await fetch(`${baseUrl}/sse`, {
      headers: {
        Authorization: 'Bearer token',
      },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to initialize session');
  });

  it('POST /messages returns 500 if handlePostMessage fails', async () => {
    // 1. Start success
    mocks.start.mockResolvedValue(undefined);

    // 2. Start SSE connection (wait for it to settle)
    const _ssePromise = fetch(`${baseUrl}/sse`, {
      headers: {
        Authorization: 'Bearer token',
      },
    });

    // Give it a moment to run and register session
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Mock handlePostMessage failure
    mocks.handlePostMessage.mockRejectedValue(new Error('Handle failed'));

    // 4. Send POST message
    const res = await fetch(`${baseUrl}/messages?sessionId=test-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Internal server error');
  });
});
