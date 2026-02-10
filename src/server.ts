import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as z from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from './config.js';
import { createSupabaseClient } from './lib/supabase.js';
import { CardInputSchema } from './schemas/card.js';
import type { WriteCardsInput } from './schemas/card.js';
import { handleHealth } from './tools/health.js';
import { handleWriteCards } from './tools/write-cards.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { SupabaseTokenVerifier } from './lib/auth-provider.js';
import { createAuthMiddleware } from './middleware/auth.js';

import { rateLimit } from 'express-rate-limit';

export function createApp(config: Config): express.Express {
  const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const app = express();
  app.set('trust proxy', 1);

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });
  app.use(limiter);

  // Health check
  app.get('/status', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.json());

  // Request logging middleware
  app.use(requestLogger);

  const authVerifier = new SupabaseTokenVerifier(supabase);

  // Root endpoint - User facing help page
  app.get('/', (req, res) => {
    res.type('text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Supabase MCP Server</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              max-width: 600px;
              margin: 40px auto;
              padding: 20px;
              text-align: center;
              line-height: 1.6;
              color: #333;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 20px;
            }
            p {
              margin-bottom: 10px;
            }
            .logo {
              font-size: 48px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="logo">🔌</div>
          <h1>Supabase MCP Server</h1>
          <p>This is a Model Context Protocol (MCP) server for Supabase.</p>
          <p>To use this server, please connect it to an MCP Client (like ChatGPT or Claude Desktop).</p>
        </body>
      </html>
    `);
  });

  // OAuth Discovery Endpoint
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
      issuer: `${config.supabaseUrl}/auth/v1`,
      authorization_endpoint: `${config.supabaseUrl}/auth/v1/oauth/authorize`,
      token_endpoint: `${config.supabaseUrl}/auth/v1/oauth/token`,
      jwks_uri: `${config.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      scopes_supported: [],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      pkce_required: true,
    });
  });

  // OAuth Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: config.publicUrl,
      authorization_servers: [`${config.supabaseUrl}/auth/v1`],
      scopes_supported: [],
      bearer_methods_supported: ['header'],
    });
  });

  // Auth Middleware
  const authenticate = createAuthMiddleware(authVerifier, config.publicUrl);

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint
  app.get('/sse', authenticate, async (req, res) => {
    logger.info('New SSE connection attempt');

    // Create a new transport for this connection
    // The endpoint URL will be where clients send messages
    const transport = new SSEServerTransport('/messages', res);
    const server = createMcpServer(supabase);

    try {
      // Connect first to ensure everything is set up
      await server.connect(transport);

      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      logger.info({ sessionId }, 'SSE session initialized');

      transport.onclose = () => {
        transports.delete(sessionId);
        logger.info({ sessionId }, 'SSE session closed');
      };

      // Start the transport - this keeps the connection open
      await transport.start();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize SSE session');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initialize session' });
      }
    }
  });

  // Messages endpoint
  app.post('/messages', authenticate, async (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).send('Missing sessionId query parameter');
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      logger.warn({ sessionId }, 'Message received for unknown session');
      res.status(404).send('Session not found');
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      logger.error({ error, sessionId }, 'Error handling message');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
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
