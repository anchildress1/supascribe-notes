import type { Config } from './config.js';
import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { logger } from './lib/logger.js';
import { createServer } from 'node:http';
import { createShutdownHandler } from './lib/shutdown.js';

const config: Config = loadConfig();

// Log configuration safely
logger.info(
  {
    ...config,
    supabaseServiceRoleKey: '***',
  },
  'Configuration loaded',
);

const app = createApp(config);
const server = createServer(app);

const port = config.port;
server.listen(port, () => {
  logger.info({ port }, 'Supascribe MCP server listening');
});

// Graceful shutdown
const shutdown = createShutdownHandler(server);

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
