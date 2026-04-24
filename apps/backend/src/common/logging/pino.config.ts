/**
 * Pino logger config for nestjs-pino.
 *
 * Goals:
 *   - JSON structured logs in prod (one log per line, parseable by Loki / ELK)
 *   - Pretty colourised logs in dev (via pino-pretty)
 *   - Correlation: each log line carries `req.id` matching the X-Request-ID
 *     header set by RequestIdMiddleware (so we can grep across services).
 *   - Redact secrets / cookies / auth headers (ISO 27001 A.5.34).
 *   - Level configurable via LOG_LEVEL env (default: info).
 */
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { randomUUID } from 'crypto';

export function buildPinoConfig(): Params {
  const isProduction = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  const pinoHttp: Options = {
    level,
    // Use the X-Request-ID we already generate in RequestIdMiddleware,
    // or fall back to a new uuid (defensive — should not happen).
    genReqId: (req, res) => {
      const incoming =
        (req.headers['x-request-id'] as string | undefined) ||
        (req as unknown as { requestId?: string }).requestId;
      const id = incoming || randomUUID();
      // Echo back so the client can correlate logs / Sentry / browser network tab.
      res.setHeader('X-Request-ID', id);
      (req as unknown as { requestId?: string }).requestId = id;
      return id;
    },
    // Redact PII / secrets from log output.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'req.body.password',
        'req.body.passwordHash',
        'req.body.refreshToken',
        'req.body.accessToken',
        'req.body.token',
        'req.body.secret',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    // Keep payloads small in prod logs.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    // Pretty output in dev only — JSON in prod (better for log aggregators).
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,req.headers,res.headers',
          },
        },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      if (res.statusCode >= 300) return 'silent';
      return 'info';
    },
  };

  return { pinoHttp };
}
