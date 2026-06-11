import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { RequirePermissions } from '../common/decorators';
import { BloomeLeadsService } from './bloome.service';
import { BloomeSyncService } from './bloome-sync.service';

/**
 * Raw Bloome setter leads (imported from Google Sheets).
 *
 * Declared on its own controller so the static `bloome/*` paths can never
 * collide with the `:id` routes on LeadsController.
 */
@ApiTags('leads')
@Controller('leads/bloome')
export class BloomeLeadsController {
  constructor(
    private readonly bloome: BloomeLeadsService,
    private readonly sync: BloomeSyncService,
  ) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(
    @Query('region') region?: string,
    @Query('q') q?: string,
    @Query('outcome') outcome?: string,
    @Query('agent') agent?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bloome.list({
      region,
      q,
      outcome,
      agent,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('summary')
  summary(@Query('region') region?: string) {
    return this.bloome.summary(region);
  }

  /** Pull the latest rows from the Google Sheet right now. */
  @RequirePermissions(PERMISSIONS.LEADS_CREATE)
  @Post('sync')
  triggerSync() {
    return this.sync.syncAll();
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('sync/status')
  syncStatus() {
    return this.sync.status();
  }
}
