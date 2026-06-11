import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@astra/shared';
import { PERMISSIONS_KEY } from '../decorators';
import type { AuthUser } from '../auth-user';

/**
 * Stage 2 of the authorization pipeline. Passes if the user's merged (UNION)
 * permissions include ALL the keys required by @RequirePermissions on the route.
 * Routes with no @RequirePermissions are allowed once authenticated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user: AuthUser = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const missing = required.filter((key) => !user.permissions.has(key));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission(s): ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
