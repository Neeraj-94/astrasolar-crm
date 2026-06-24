import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  LeadOutcome,
  LeadStage,
  PERMISSIONS,
  SalesDisposition,
} from '@astra/shared';
import { LeadsService } from './leads.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  AddActivityDto,
  BookLeadDto,
  BookLeadSlotDto,
  CreateLeadDto,
  ReassignDto,
  UpdateDispositionDto,
  UpdateOutcomeDto,
} from './dto';
import { ReorderDto } from '../common/reorder.dto';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('stage') stage?: LeadStage,
    @Query('disposition') disposition?: string,
    @Query('outcome') outcome?: string,
    @Query('userId') userId?: string,
  ) {
    // `disposition` and `outcome` each accept a single value or a
    // comma-separated list (e.g. NOT_INTERESTED,DNQ,CANCELLED). When both are
    // supplied the service matches leads in EITHER set (disposition OR outcome).
    const dispositions = disposition
      ? (disposition
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean) as SalesDisposition[])
      : undefined;
    const outcomes = outcome
      ? (outcome
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean) as LeadOutcome[])
      : undefined;
    return this.leads.list(user, {
      stage,
      disposition: dispositions,
      outcome: outcomes,
      userId,
    });
  }

  /** Persist drag-and-drop row order (declared before :id routes). */
  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Patch('reorder')
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderDto) {
    return this.leads.reorder(user, dto.ids);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.get(user, id);
  }

  @RequirePermissions(PERMISSIONS.LEADS_CREATE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Patch(':id/outcome')
  updateOutcome(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOutcomeDto,
  ) {
    return this.leads.updateOutcome(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Post(':id/book')
  book(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BookLeadDto,
  ) {
    return this.leads.book(user, id, dto);
  }

  /** Book / rebook an existing lead into a schedule slot (Book Appointment). */
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Post(':id/book-slot')
  bookIntoSlot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BookLeadSlotDto,
  ) {
    return this.leads.bookIntoSlot(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Patch(':id/disposition')
  updateDisposition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDispositionDto,
  ) {
    return this.leads.updateDisposition(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.LEADS_REASSIGN)
  @Patch(':id/reassign')
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReassignDto,
  ) {
    return this.leads.reassign(user, id, dto.ownerId);
  }

  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Post(':id/activities')
  addActivity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddActivityDto,
  ) {
    return this.leads.addActivity(user, id, dto);
  }
}
