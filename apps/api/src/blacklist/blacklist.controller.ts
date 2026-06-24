import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { BlacklistService } from './blacklist.service';
import { CreateBlacklistEntryDto } from './dto';

/**
 * Blacklist Leads — Leads -> Blacklist Leads tab.
 *
 *   GET    /blacklist/entries     list entries (any staff with record access)
 *   POST   /blacklist/entries     add entry + auto-sweep (any Leads dashboard user)
 *   DELETE /blacklist/entries/:id remove entry (any Leads dashboard user)
 *   GET    /blacklist/log         removal log (any staff with record access)
 *   POST   /blacklist/sweep       manual "Re-scan All Tabs" (any Leads dashboard user)
 *
 * Edit endpoints are gated by DASHBOARD_LEADGEN — i.e. anyone who can open the
 * Leads dashboard — matching the legacy "any Leads Dashboard user" rule.
 */
@ApiTags('blacklist')
@Controller('blacklist')
export class BlacklistController {
  constructor(private readonly service: BlacklistService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('entries')
  listEntries() {
    return this.service.listEntries();
  }

  @RequirePermissions(PERMISSIONS.DASHBOARD_LEADGEN)
  @Post('entries')
  addEntry(@CurrentUser() user: AuthUser, @Body() dto: CreateBlacklistEntryDto) {
    return this.service.addEntry(user, dto);
  }

  @RequirePermissions(PERMISSIONS.DASHBOARD_LEADGEN)
  @Delete('entries/:id')
  removeEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeEntry(user, id);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('log')
  listLog() {
    return this.service.listLog();
  }

  @RequirePermissions(PERMISSIONS.DASHBOARD_LEADGEN)
  @Post('sweep')
  sweep(@CurrentUser() user: AuthUser) {
    return this.service.runSweep(user);
  }
}
