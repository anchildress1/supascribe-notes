import pino from 'pino';
import { hostname } from 'node:os';
import process from 'node:process';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: isDev ? undefined : { pid: process.pid, hostname: hostname() },
});
