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
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { SupabaseTokenVerifier } from './lib/auth-provider.js';
import { CardInputSchema } from './schemas/card.js';
import type { WriteCardsInput } from './schemas/card.js';
import { handleHealth } from './tools/health.js';
import { handleWriteCards } from './tools/write-cards.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/request-logger.js';

export function createApp(config: Config): express.Express {
  const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const app = express();
  app.set('trust proxy', 1);

  // Health check: defined BEFORE middleware to bypass auth/logging/rate-limiting
  app.get('/status', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.json());

  // Request logging middleware
  app.use(requestLogger);

  // Rate limiter: 60 requests per minute per IP (generous for single-user tool)
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });

  app.use(limiter);
  // OAuth Metadata and Auth Middleware
  const authBase = `${config.supabaseUrl}/auth/v1`;
  const verifier = new SupabaseTokenVerifier(supabase);

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: {
        issuer: authBase,
        authorization_endpoint: new URL(`${authBase}/authorize`).toString(),
        token_endpoint: new URL(`${authBase}/token?grant_type=password`).toString(),
        jwks_uri: new URL(`${authBase}/.well-known/jwks.json`).toString(),
        response_types_supported: ['code', 'token'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      },
      resourceServerUrl: new URL(config.publicUrl),
      scopesSupported: [],
    }),
  );

  app.use(requireBearerAuth({ verifier }));

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
          logger.debug({ sid }, 'MCP session initialized');
        },
      });

      transport.onclose = () => {
        const sid = [...transports.entries()].find(([_, t]) => t === transport)?.[0];
        if (sid) {
          transports.delete(sid);
          logger.debug({ sid }, 'MCP session closed');
        }
      };

      const server = createMcpServer(supabase);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    logger.warn('Invalid MCP request: missing session ID or not an init request');
    res.status(400).json({ error: 'Invalid request: expected initialization or valid session' });
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
    async ({ cards }: WriteCardsInput) => handleWriteCards(supabase, cards),
  );

  return server;
}
