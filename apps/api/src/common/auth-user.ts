import type { VisibilityScope } from '@astra/shared';

/**
 * The authenticated principal attached to every request by JwtStrategy.
 * `permissions` is the UNION across all the user's roles.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string | null;
  roleKeys: string[];
  permissions: Set<string>;
  scope: VisibilityScope;
}
