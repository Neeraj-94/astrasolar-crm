import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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

  // Per-sale commission payout report (finance Commissions tab). Money-sensitive.
  @RequirePermissions(PERMISSIONS.FINANCE_READ_ALL)
  @Get('commission-payout')
  commissionPayout(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.commissionPayout(user, { userId, from, to });
  }

  // ---- CEO dashboard ----

  // Revenue is money-sensitive.
  @RequirePermissions(PERMISSIONS.FINANCE_READ_ALL)
  @Get('revenue')
  revenue(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.revenue(user, { userId, from, to });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('growth')
  growth(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.growth(user, { userId, from, to });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('operations')
  operations(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    return this.analytics.operations(user, { userId });
  }

  // ---- Sales Manager dashboard ----

  @RequirePermissions(PERMISSIONS.SALES_READ_TEAM)
  @Get('sales-performance')
  salesPerformance(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    return this.analytics.salesPerformance(user, userId);
  }

  @RequirePermissions(PERMISSIONS.SALES_READ_TEAM)
  @Get('approvals')
  approvals(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    return this.analytics.approvalsQueue(user, userId);
  }

  @RequirePermissions(PERMISSIONS.SALES_READ_TEAM)
  @Patch('approvals/:saleId')
  decideApproval(
    @CurrentUser() user: AuthUser,
    @Param('saleId') saleId: string,
    @Body() body: { decision: 'APPROVE' | 'HOLD' | 'REJECT'; note?: string },
  ) {
    return this.analytics.decideApproval(
      user,
      saleId,
      body.decision,
      body.note,
    );
  }
}
