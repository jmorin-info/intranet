import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!MUTATION_METHODS.includes(method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const user = request.user;
          const path = request.route?.path || request.url;
          const pathParts = path.split('/').filter(Boolean);
          const resourceType = pathParts[1] || pathParts[0] || 'unknown';
          const resourceId = request.params?.id || undefined;

          this.auditService
            .log({
              userId: user?.id || undefined,
              ipAddress: request.ip || request.socket?.remoteAddress || undefined,
              userAgent: request.headers['user-agent'] || undefined,
              action: `${method} ${path}`,
              resourceType,
              resourceId,
              metadata: {
                requestId: request['requestId'] || undefined,
                duration,
                statusCode: 200,
                params: request.params,
              },
              severity: method === 'DELETE' ? 'WARN' : 'INFO',
            })
            .catch((err) => {
              this.logger.error(`Audit log failed: ${err.message}`);
            });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const user = request.user;
          const path = request.route?.path || request.url;
          const pathParts = path.split('/').filter(Boolean);
          const resourceType = pathParts[1] || pathParts[0] || 'unknown';
          const resourceId = request.params?.id || undefined;

          this.auditService
            .log({
              userId: user?.id || undefined,
              ipAddress: request.ip || request.socket?.remoteAddress || undefined,
              userAgent: request.headers['user-agent'] || undefined,
              action: `${method} ${path} [FAILED]`,
              resourceType,
              resourceId,
              metadata: {
                requestId: request['requestId'] || undefined,
                duration,
                error: error.message,
                statusCode: error.status || 500,
              },
              severity: 'WARN',
            })
            .catch((err) => {
              this.logger.error(`Audit log failed: ${err.message}`);
            });
        },
      }),
    );
  }
}
