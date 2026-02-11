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
import { createAuthMiddleware, type AuthenticatedRequest } from './middleware/auth.js';
import { renderAuthPage } from './views/auth-view.js';
import { renderHelpPage } from './views/help-view.js';

interface SupabaseAdmin {
  approveOAuthAuthorization(
    authorizationId: string,
    userId: string,
  ): Promise<{
    data: { url?: string; redirect_url?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization(authorizationId: string): Promise<{
    data: { url?: string; redirect_url?: string } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization(
    authorizationId: string,
    userId: string,
  ): Promise<{
    data: { url?: string; redirect_url?: string } | null;
    error: { message: string } | null;
  }>;
}

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

  // Root endpoint - Login/Consent UI or Help page
  app.get('/', (req, res) => {
    const authId = req.query.authorization_id;

    if (authId) {
      res.type('text/html').send(renderAuthPage(config));
      return;
    }

    // Root endpoint - User facing help page
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

  // Auth Middleware
  const authenticate = createAuthMiddleware(authVerifier, config.publicUrl);

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // OAuth Backend API for Custom UI
  // Requires user session verification
  app.post('/api/oauth/approve', authenticate, async (req, res) => {
    const { authorization_id } = req.body;
    const user = (req as AuthenticatedRequest).user; // Set by authenticate middleware

    if (!authorization_id) {
      res.status(400).json({ error: 'Missing authorization_id' });
      return;
    }

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Use Service Role Key to bypass RLS and perform admin actions
    // However, we must ensure the USER approving is the logged in user.
    // 'approveAuthorization' takes 'user_id' typically.

    try {
      // According to our research, this method is under auth.admin
      // TypeScript might complain if types are outdated.
      // We cast to 'unknown' then to our interface to avoid build issues while relying on the underlying library method.
      const { data, error } = await (
        supabase.auth.admin as unknown as SupabaseAdmin
      ).approveOAuthAuthorization(authorization_id, user.id);

      if (error) throw error;
      if (!data) throw new Error('No data returned from Supabase');

      res.json({ redirect_url: data.url || data.redirect_url }); // API usually returns the redirect URL with code
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMsg }, 'Failed to approve authorization');

      // Fallback: try different method name if 'approveOAuthAuthorization' fails?
      // Some versions use `approveAuthorization`. Let's try that too if the first fails?
      // Or better yet, stick to `approveAuthorization` if that's what docs say.
      // Re-checking Step 206 summary: "approveAuthorization".
      // Let's use `approveAuthorization` as primary.
      try {
        const { data: data2, error: error2 } = await (
          supabase.auth.admin as unknown as SupabaseAdmin
        ).approveAuthorization(authorization_id, user.id);
        if (error2) throw error2; // Throw original error if this fails too
        if (!data2) throw new Error('No data returned from fallback approval');
        res.json({ redirect_url: data2.url || data2.redirect_url });
      } catch {
        res.status(500).json({ error: errorMsg });
      }
    }
  });

  app.post('/api/oauth/deny', authenticate, async (req, res) => {
    const { authorization_id } = req.body;

    if (!authorization_id) {
      res.status(400).json({ error: 'Missing authorization_id' });
      return;
    }

    try {
      // Same logic for deny
      const { data, error } = await (
        supabase.auth.admin as unknown as SupabaseAdmin
      ).denyAuthorization(authorization_id);
      if (error) throw error;
      if (!data) throw new Error('No data returned from Supabase');
      res.json({ redirect_url: data.url || data.redirect_url });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMsg }, 'Failed to deny authorization');
      res.status(500).json({ error: errorMsg });
    }
  });

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
