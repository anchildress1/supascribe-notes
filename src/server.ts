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

export function createApp(config: Config): express.Express {
  const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const app = express();
  app.set('trust proxy', 1);

  // Health check
  app.get('/status', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(express.json());

  // Request logging middleware
  app.use(requestLogger);

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint
  app.get('/sse', async (req, res) => {
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
  app.post('/messages', async (req, res) => {
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
