/**
 * SentryExceptionFilter — intercepts unhandled exceptions and reports them
 * to Sentry with request + user context, then defers to the default
 * Nest exception filter for the actual HTTP response.
 *
 * Behaviour:
 *   - 4xx HttpException (validation, not-found, forbidden…) are NOT sent
 *     to Sentry (they are expected user errors and would create noise).
 *   - 5xx and uncaught errors ARE sent to Sentry (with user, request id,
 *     route, method, query, sanitised headers).
 *   - Always attaches `requestId` (from request-id.middleware) as a tag
 *     so logs (pino) and Sentry events can be correlated.
 *
 * Opt-in: if Sentry was not initialised (SENTRY_DSN missing), this filter
 * is a transparent passthrough.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { isSentryEnabled } from "./sentry.init";
import { sendSiemEvent } from "./siem/gelf.client";

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request | undefined>();
    const response = ctx.getResponse<Response | undefined>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only report 5xx and unknown errors to Sentry (avoid 4xx noise).
    if (isSentryEnabled() && status >= 500) {
      try {
        Sentry.withScope((scope) => {
          if (request) {
            const requestId = (request as unknown as { requestId?: string }).requestId;
            if (requestId) {
              scope.setTag("request_id", requestId);
            }
            scope.setTag("http.method", request.method);
            scope.setTag("http.route", request.route?.path || request.url);
            scope.setContext("request", {
              method: request.method,
              url: request.url,
              query: request.query,
              ip: request.ip,
            });

            // Attach user context if request was authenticated (set by JwtAuthGuard).
            const user = (
              request as unknown as { user?: { id?: string; email?: string; role?: string } }
            ).user;
            if (user?.id) {
              scope.setUser({
                id: String(user.id),
                email: user.email,
                role: user.role,
              });
            }
          }
          scope.setLevel("error");
          Sentry.captureException(exception);
        });
      } catch (sentryErr) {
        // Never let Sentry break error handling.
        this.logger.error("Sentry capture failed", sentryErr as Error);
      }
    }

    // Forwarding SIEM des 5xx — symétrique au bloc Sentry ci-dessus, mais
    // indépendant de isSentryEnabled() (SIEM a son propre gate SIEM_ENABLED).
    // Best-effort strict : jamais bloquant pour la réponse HTTP.
    if (status >= 500) {
      try {
        const requestId = request
          ? (request as unknown as { requestId?: string }).requestId
          : undefined;
        sendSiemEvent({
          shortMessage: `HTTP ${status} ${request?.method ?? ""} ${request?.url ?? ""}`,
          level: 3, // syslog "error"
          fields: {
            facility: "http-error",
            status_code: status,
            method: request?.method,
            route: request?.route?.path || request?.url,
            request_id: requestId,
            error_message: exception instanceof Error ? exception.message : String(exception),
          },
        });
      } catch {
        // best-effort — jamais bloquant
      }
    }

    // Fall back to the default Nest behaviour for the HTTP response.
    // If we have access to the http adapter (set in main.ts via super(adapter))
    // BaseExceptionFilter handles the response. Otherwise we render manually.
    if (response && typeof response.status === "function") {
      try {
        super.catch(exception, host);
        return;
      } catch {
        // Fallback: minimal JSON error.
        const body =
          exception instanceof HttpException
            ? exception.getResponse()
            : { statusCode: status, message: "Internal server error" };
        response.status(status).json(body);
      }
    }
  }
}
