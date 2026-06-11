import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PermissionKey } from '@astra/shared';
import type { AuthUser } from './auth-user';

// ---- @Public() — skip JwtAuthGuard on this route -----------------------------
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ---- @RequirePermissions(...) — coarse capability gate -----------------------
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...perms: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

// ---- @Audit({ action, entity }) — declarative audit logging ------------------
export interface AuditMeta {
  action: string;
  entity: string;
}
export const AUDIT_KEY = 'auditMeta';
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);

// ---- @CurrentUser() — inject the authenticated principal ---------------------
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser = req.user;
    return data ? user?.[data] : user;
  },
);
