import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { FinancialsService, type WeeklySalesRange } from './financials.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

/**
 * Financials dashboard endpoints (port of the v1 CEO Financials widgets).
 * Everything here is money-sensitive, so the whole controller is gated to
 * finance:read:all — held by the CEO and Finance roles (v1 parity: the
 * widgets were visible to ceo/finance only).
 */
@ApiTags('dashboards')
@RequirePermissions(PERMISSIONS.FINANCE_READ_ALL)
@Controller('dashboards/financials')
export class FinancialsController {
  constructor(private readonly financials: FinancialsService) {}

  /** Week options for the selector (Mondays, newest first). */
  @Get('weeks')
  weeks(@CurrentUser() user: AuthUser) {
    return this.financials.weeks(user);
  }

  /** Weekly P&L: summary cards, per-sale breakdown, costs, P&L by state. */
  @Get()
  weekly(@CurrentUser() user: AuthUser, @Query('week') week?: string) {
    return this.financials.weekly(user, week);
  }

  /** Yearly P&L: one row per week with totals. */
  @Get('yearly')
  yearly(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.financials.yearly(user, year);
  }

  /** Sales table for a range (this week, last month, …). */
  @Get('weekly-sales')
  weeklySales(
    @CurrentUser() user: AuthUser,
    @Query('range') range?: string,
  ) {
    return this.financials.weeklySales(
      user,
      (range ?? 'this_week') as WeeklySalesRange,
    );
  }

  // ---- Extra weekly operating costs ----

  @Post('operating-costs')
  addOperatingCost(
    @CurrentUser() user: AuthUser,
    @Body() body: { week?: string; label?: string; amount?: number },
  ) {
    return this.financials.addOperatingCost(user, body);
  }

  @Delete('operating-costs/:id')
  removeOperatingCost(@Param('id') id: string) {
    return this.financials.removeOperatingCost(id);
  }

  // ---- Pending RRP requests ----

  @Get('rrp-requests')
  listRrpRequests(@Query('status') status?: string) {
    return this.financials.listRrpRequests(status);
  }

  @Patch('rrp-requests/:id/complete')
  completeRrpRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: { items?: { type: string; product: string; rrp: number }[] },
  ) {
    return this.financials.completeRrpRequest(user, id, body);
  }

  @Patch('rrp-requests/:id/dismiss')
  dismissRrpRequest(@Param('id') id: string) {
    return this.financials.dismissRrpRequest(id);
  }

  // ---- Invoices (derived from sales) ----

  @Get('invoices')
  invoices(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.financials.invoices(user, userId);
  }

  @Patch('invoices/:saleId/status')
  setInvoiceStatus(
    @CurrentUser() user: AuthUser,
    @Param('saleId') saleId: string,
    @Body() body: { status?: string },
  ) {
    return this.financials.setInvoiceStatus(user, saleId, body.status);
  }

  // ---- Payments ----

  @Get('payments')
  payments(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.financials.payments(user, userId);
  }

  @Post('payments/:saleId')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('saleId') saleId: string,
    @Body()
    body: { paymentDate?: string; paymentNotes?: string; markPaid?: boolean },
  ) {
    return this.financials.recordPayment(user, saleId, body);
  }
}
