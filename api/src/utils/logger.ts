import winston from 'winston';

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

// Custom readable format for console
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${timestamp} [${level}] ${message}${metaStr}${stackStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss.SSS' }),
        errors({ stack: true }),
        consoleFormat
      )
    })
  ]
});

// Convenience helpers for structured route logging
export function logRoute(method: string, path: string, userId?: string, meta?: Record<string, unknown>) {
  logger.info(`→ ${method} ${path}`, { userId: userId || 'anon', ...meta });
}

export function logRouteOk(method: string, path: string, userId?: string, meta?: Record<string, unknown>) {
  logger.info(`✓ ${method} ${path}`, { userId: userId || 'anon', ...meta });
}

export function logRouteError(method: string, path: string, err: unknown, userId?: string, meta?: Record<string, unknown>) {
  logger.error(`✗ ${method} ${path}`, {
    userId: userId || 'anon',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...meta
  });
}

export function logDbError(operation: string, table: string, err: unknown, meta?: Record<string, unknown>) {
  logger.error(`[DB] ${operation} on '${table}' failed`, {
    dbError: err,
    ...meta
  });
}
