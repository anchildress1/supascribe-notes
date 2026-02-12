import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { WriteCardsInputSchema } from './schemas/card.js';
import type { WriteCardsInput } from './schemas/card.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './lib/supabase.js';
import type { Config } from './config.js';
import { handleHealth } from './tools/health.js';
import { handleWriteCards } from './tools/write-cards.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { SupabaseTokenVerifier } from './lib/auth-provider.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { renderAuthPage } from './views/auth-view.js';
import { renderHelpPage } from './views/help-view.js';
import { createOpenApiSpec } from './lib/openapi.js';
import cors from 'cors';

// Rate limiting is handled by the middleware

export function createApp(config: Config): express.Express {
  const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const app = express();
  app.set('trust proxy', 1);

  // Health check
  app.get('/status', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Enable CORS
  app.use(cors());

  app.use(express.json());

  // Request logging middleware
  app.use(requestLogger);

  const authVerifier = new SupabaseTokenVerifier(supabase);

  // OAuth Authorization UI endpoint
  app.get('/auth/authorize', (req, res) => {
    res.type('text/html').send(renderAuthPage(config));
  });

  // OpenAPI Spec
  app.get('/openapi.json', (req, res) => {
    const spec = createOpenApiSpec(config.publicUrl);
    res.json(spec);
  });

  // REST Health Check (matches /status)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Root endpoint - User facing help page
  app.get('/', (req, res) => {
    // Redirect to SSE endpoint if client prefers text/event-stream
    // This helps MCP clients that are configured with the root URL
    const preferred = req.accepts(['html', 'text/event-stream']);
    if (preferred === 'text/event-stream') {
      res.redirect(307, '/sse');
      return;
    }

    res.type('text/html').send(renderHelpPage());
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
      resource: config.supabaseUrl,
      authorization_servers: [`${config.supabaseUrl}/auth/v1`],
      scopes_supported: [],
      bearer_methods_supported: ['header'],
    });
  });

  // SSE specific OAuth Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource/sse', (_req, res) => {
    res.json({
      resource: config.supabaseUrl,
      authorization_servers: [`${config.supabaseUrl}/auth/v1`],
      scopes_supported: [],
      bearer_methods_supported: ['header'],
    });
  });

  // Handle incorrect path appended by ChatGPT
  app.get('/sse/auth/authorize', (req, res) => {
    const query = new URLSearchParams(req.query as unknown as Record<string, string>).toString();
    res.redirect(`/auth/authorize?${query}`);
  });

  // Auth Middleware
  const authenticate = createAuthMiddleware(authVerifier, config.publicUrl);

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint
  app.use('/sse', authenticate, async (req, res) => {
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
      // Start the transport - this keeps the connection open
      // transport.start() is already called by server.connect(transport)
      // so we don't need to call it again.
    } catch (error) {
      logger.error({ error }, 'Failed to initialize SSE session');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initialize session' });
      }
    }
  });

  // ChatGPT Apps Action: Write Cards
  app.post('/api/write-cards', authenticate, async (req, res) => {
    try {
      logger.info('Received write-cards request from ChatGPT/App');
      const bodyResult = WriteCardsInputSchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'Validation failed', details: bodyResult.error });
        return;
      }

      // Reuse the MCP tool logic
      const result = await handleWriteCards(supabase, bodyResult.data.cards);

      // Unwrap MCP result
      if (result.isError) {
        const errorText =
          result.content[0].type === 'text' ? result.content[0].text : 'Unknown error';
        // Try to parse if it's JSON
        try {
          const parsed = JSON.parse(errorText);
          res.status(500).json(parsed);
        } catch {
          res.status(500).json({ error: errorText });
        }
        return;
      }

      const successText = result.content[0].type === 'text' ? result.content[0].text : '{}';
      res.json(JSON.parse(successText));
    } catch (err) {
      logger.error({ error: err }, 'REST write-cards failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Messages endpoint
  app.post('/messages', authenticate, async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).send('Missing or invalid sessionId query parameter');
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

export function createMcpServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer({
    name: 'supascribe-notes-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'health',
    {
      title: 'Health Check',
      description: 'Check server and Supabase connectivity status',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ['model', 'app'] },
      },
    },
    async () => handleHealth(supabase),
  );

  server.registerTool(
    'write_cards',
    {
      title: 'Write Index Cards',
      description: 'Validate and upsert index cards to Supabase with revision history',
      inputSchema: WriteCardsInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ['model', 'app'] },
      },
    },
    async ({ cards }: WriteCardsInput) => handleWriteCards(supabase, cards),
  );

  return server;
}
