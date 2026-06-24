import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { ConsultantContactsService } from './consultant-contacts.service';
import { UpsertConsultantContactDto } from './dto';

/**
 * Consultant Contacts — Leads -> Consultant Contacts tab.
 *
 *   GET    /consultant-contacts             list (any staff with record access)
 *   PUT    /consultant-contacts/:id         upsert (leads:contacts:manage)
 *   DELETE /consultant-contacts/:id         remove override (leads:contacts:manage)
 */
@ApiTags('consultant-contacts')
@Controller('consultant-contacts')
export class ConsultantContactsController {
  constructor(private readonly service: ConsultantContactsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions(PERMISSIONS.LEADS_CONTACTS_MANAGE)
  @Put(':consultantId')
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('consultantId') consultantId: string,
    @Body() dto: UpsertConsultantContactDto,
  ) {
    return this.service.upsert(user, consultantId, dto);
  }

  @RequirePermissions(PERMISSIONS.LEADS_CONTACTS_MANAGE)
  @Delete(':consultantId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('consultantId') consultantId: string,
  ) {
    return this.service.remove(user, consultantId);
  }
}
