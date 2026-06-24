import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { ChecklistService } from './checklist.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { SaveChecklistDto, SelectOptionDto } from './dto';
import { ChecklistExceptionFilter } from './checklist-exception.filter';

/**
 * Per-lead system-recommendation checklist. Nested under the lead so it's
 * scoped to one lead's id. Reads need records:read:own; writes need
 * leads:write:own (a consultant has both). The service re-checks visibility
 * scope, the booked-status precondition, and ownership of the option.
 */
@ApiTags('checklist')
@UseFilters(ChecklistExceptionFilter)
@Controller('leads/:leadId/checklist')
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  get(@CurrentUser() user: AuthUser, @Param('leadId') leadId: string) {
    return this.checklist.getByLead(user, leadId);
  }

  /** Save / update the captured fields (no AI call). */
  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Param('leadId') leadId: string,
    @Body() dto: SaveChecklistDto,
  ) {
    return this.checklist.save(user, leadId, dto);
  }

  /** Persist the latest capture, then ask Nova for the 5 quote-ready packages. */
  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Post('recommendations')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('leadId') leadId: string,
    @Body() dto: SaveChecklistDto,
  ) {
    return this.checklist.generate(user, leadId, dto);
  }

  /** Record the option the consultant chose to take forward. */
  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Post('select')
  select(
    @CurrentUser() user: AuthUser,
    @Param('leadId') leadId: string,
    @Body() dto: SelectOptionDto,
  ) {
    return this.checklist.selectOption(user, leadId, dto.optionId);
  }
}
