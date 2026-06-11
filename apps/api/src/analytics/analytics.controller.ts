import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

/**
 * Dashboard data endpoints. All are scoped to what the viewer may see; the
 * `userId` query param is the scope-selector (re-validated server-side and
 * audited via DASHBOARD_VIEW when it targets another user).
 */
@ApiTags('dashboards')
@Controller('dashboards')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.summary(user, { userId, from, to });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('lead-funnel')
  leadFunnel(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.leadFunnel(user, { userId, from, to });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('fulfilment-funnel')
  fulfilment(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    return this.analytics.fulfilmentFunnel(user, { userId });
  }

  // Commission/finance figures require finance:read:all.
  @RequirePermissions(PERMISSIONS.FINANCE_READ_ALL)
  @Get('commission-summary')
  commission(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.commissionSummary(user, { userId, from, to });
  }
}
