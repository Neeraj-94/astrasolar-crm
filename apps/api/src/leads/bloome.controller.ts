import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { BloomeLeadsService } from './bloome.service';
import { BloomeSyncService } from './bloome-sync.service';
import { BookBloomeLeadDto, UpdateBloomeLeadDto } from './dto';

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

  // Parameterised routes LAST so they can never shadow the static paths above.

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.bloome.getOne(id);
  }

  /** Inline edit of agent / dials / outcome / notes from the Bloome list. */
  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBloomeLeadDto,
  ) {
    return this.bloome.update(user, id, dto);
  }

  /** Book the lead into a consultant's Leads Schedule timeslot. */
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Post(':id/book')
  book(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BookBloomeLeadDto,
  ) {
    return this.bloome.book(user, id, dto);
  }
}
