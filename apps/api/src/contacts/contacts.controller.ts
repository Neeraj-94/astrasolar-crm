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
import { PERMISSIONS } from '@astra/shared';
import { ContactsService } from './contacts.service';
import { Audit, RequirePermissions } from '../common/decorators';
import { CreateAccountDto, CreateContactDto, UpdateContactDto } from './dto';

@ApiTags('contacts')
@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('contacts')
  list(@Query('search') search?: string) {
    return this.contacts.list(search);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('contacts/:id')
  get(@Param('id') id: string) {
    return this.contacts.get(id);
  }

  @RequirePermissions(PERMISSIONS.LEADS_CREATE)
  @Audit({ action: 'CONTACT_CREATED', entity: 'Contact' })
  @Post('contacts')
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @RequirePermissions(PERMISSIONS.LEADS_WRITE_OWN)
  @Audit({ action: 'CONTACT_UPDATED', entity: 'Contact' })
  @Patch('contacts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('accounts')
  listAccounts() {
    return this.contacts.listAccounts();
  }

  @RequirePermissions(PERMISSIONS.LEADS_CREATE)
  @Audit({ action: 'ACCOUNT_CREATED', entity: 'Account' })
  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.contacts.createAccount(dto);
  }
}
