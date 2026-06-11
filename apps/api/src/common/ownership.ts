import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '@astra/shared';
import type { AuthUser } from './auth-user';

/**
 * Stage 4 of the authorization pipeline: ownership.
 *
 * For `:own` actions the service must verify the record belongs to the acting
 * user. A manager's broader team scope does NOT override this — e.g. only the
 * owning consultant (or break-glass super admin) may mark a sale SOLD or edit
 * it, even though a manager can READ team sales.
 */
export function assertOwnership(
  user: AuthUser,
  ownerId: string,
  opts: { allowSuperAdmin?: boolean } = { allowSuperAdmin: true },
): void {
  if (user.id === ownerId) return;
  if (
    opts.allowSuperAdmin &&
    user.permissions.has(PERMISSIONS.SYSTEM_ADMIN)
  ) {
    return; // break-glass
  }
  throw new ForbiddenException('You do not own this record');
}
