import type { Config } from './config.js';
import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { logger } from './lib/logger.js';
import { createServer } from 'node:http';

const config: Config = loadConfig();

// Log configuration safely
logger.info(
  {
    ...config,
    supabaseServiceRoleKey: '***',
    mcpAuthToken: '***',
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
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit if server doesn't close in 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
