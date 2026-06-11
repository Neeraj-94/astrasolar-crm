import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { SheetsService, SheetRow } from './sheets.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

@ApiTags('integrations')
@Controller('integrations/sheets')
export class IntegrationsController {
  constructor(private readonly sheets: SheetsService) {}

  /**
   * Manual / webhook sync entry point. The production poller calls
   * SheetsService.importRows directly on its BullMQ schedule.
   */
  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN)
  @Post('sync')
  sync(@CurrentUser('id') userId: string, @Body() body: { rows: SheetRow[] }) {
    return this.sheets.importRows(body.rows ?? [], userId);
  }
}
