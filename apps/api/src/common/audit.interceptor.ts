import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMeta } from './decorators';
import type { AuthUser } from './auth-user';
import { AuditService } from './audit.service';

/**
 * Declarative audit logging: any route annotated with @Audit({action, entity})
 * writes an AuditLog row after it succeeds. Mutations that need transactional
 * audit (book/sell) write their own audit row inside the transaction instead —
 * this interceptor covers the broad "who did what" trail for the rest.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;

    return next.handle().pipe(
      tap((result) => {
        if (!user) return;
        const entityId =
          (result && (result.id || result?.data?.id)) ||
          req.params?.id ||
          'unknown';
        void this.audit.record({
          userId: user.id,
          action: meta.action,
          entity: meta.entity,
          entityId: String(entityId),
          metadata: { method: req.method, path: req.url },
        });
      }),
    );
  }
}
