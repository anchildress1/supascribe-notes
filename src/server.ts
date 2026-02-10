import { randomUUID } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';
import { createSupabaseClient } from './lib/supabase.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { CardInputSchema } from './schemas/card.js';
import { handleHealth } from './tools/health.js';
import { handleWriteCards } from './tools/write-cards.js';

export function createApp(config: Config): express.Express {
  const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const app = express();
  app.use(express.json());

  // Rate limiter: 60 requests per minute per IP (generous for single-user tool)
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

  app.use(limiter);
  app.use(createAuthMiddleware(config.mcpAuthToken));

  // Session management for MCP transports
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Reuse existing transport for established sessions
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Create new transport for initialization requests
    if (!sessionId && isInitializeRequest(req.body)) {
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = [...transports.entries()].find(([_, t]) => t === transport)?.[0];
        if (sid) transports.delete(sid);
      };

      const server = createMcpServer(supabase);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Invalid request: expected initialization or valid session' });
  });

  // Non-MCP health endpoint for load balancers / smoke tests
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

function createMcpServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer({
    name: 'supascribe-notes-mcp',
    version: '1.0.0',
  });

  server.tool('health', 'Check server and Supabase connectivity status', {}, async () =>
    handleHealth(supabase),
  );

  server.tool(
    'write_cards',
    'Validate and upsert index cards to Supabase with revision history',
    {
      cards: z.array(CardInputSchema).min(1).max(50),
    },
    async ({ cards }) => handleWriteCards(supabase, cards),
  );

  return server;
}
