import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { SheetsService, SheetRow } from './sheets.service';
import {
  INTEGRATION_SETTING_KEYS,
  IntegrationSettingsService,
} from './integration-settings.service';
import { IntegrationSettingsUpdateDto } from './dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuditService } from '../common/audit.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly sheets: SheetsService,
    private readonly settings: IntegrationSettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Manual / webhook sync entry point. The production poller calls
   * SheetsService.importRows directly on its BullMQ schedule.
   */
  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN)
  @Post('sheets/sync')
  sync(@CurrentUser('id') userId: string, @Body() body: { rows: SheetRow[] }) {
    return this.sheets.importRows(body.rows ?? [], userId);
  }

  // ── Integration credentials (integrations:manage) ───────────────────────────

  /** Client-safe view — secrets reported only as booleans. */
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @Get('settings')
  getSettings() {
    return this.settings.status();
  }

  /** Upsert integration credentials. Empty string clears a field. */
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @Patch('settings')
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: IntegrationSettingsUpdateDto,
  ) {
    const K = INTEGRATION_SETTING_KEYS;
    const map: Record<string, string> = {};
    if (dto.clicksendUsername !== undefined)
      map[K.CLICKSEND_USERNAME] = dto.clicksendUsername;
    if (dto.clicksendApiKey !== undefined)
      map[K.CLICKSEND_API_KEY] = dto.clicksendApiKey;
    if (dto.aircallApiId !== undefined) map[K.AIRCALL_API_ID] = dto.aircallApiId;
    if (dto.aircallApiToken !== undefined)
      map[K.AIRCALL_API_TOKEN] = dto.aircallApiToken;
    if (dto.sheetsApiKey !== undefined) map[K.SHEETS_API_KEY] = dto.sheetsApiKey;
    if (dto.sheetsSpreadsheetId !== undefined)
      map[K.SHEETS_SPREADSHEET_ID] = dto.sheetsSpreadsheetId;
    if (dto.anthropicApiKey !== undefined)
      map[K.ANTHROPIC_API_KEY] = dto.anthropicApiKey;

    await this.settings.setMany(map, userId);

    // Audit which integration fields changed — never the values themselves.
    await this.audit.record({
      userId,
      action: 'INTEGRATION_SETTINGS_UPDATED',
      entity: 'IntegrationSetting',
      entityId: 'settings',
      metadata: { fields: Object.keys(map) },
    });

    return this.settings.status();
  }
}
