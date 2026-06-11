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
import { LeadStage, PERMISSIONS } from '@astra/shared';
import { LeadsService } from './leads.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  AddActivityDto,
  BookLeadDto,
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
    @Query('userId') userId?: string,
  ) {
    return this.leads.list(user, { stage, userId });
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
