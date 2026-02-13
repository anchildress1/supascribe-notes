import type { Server } from 'node:http';
import { logger } from '../lib/logger.js';

export function createShutdownHandler(server: Server) {
  return (signal: string) => {
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
}
