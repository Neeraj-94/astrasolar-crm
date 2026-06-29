import { Global, Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { IntegrationSettingsService } from './integration-settings.service';
import { IntegrationsController } from './integrations.controller';
import { UsersModule } from '../users/users.module';

/**
 * Global so the runtime-editable integration credentials
 * (IntegrationSettingsService) can be injected by ClickSend / Aircall / Nova
 * without each importing this module. PrismaModule + CommonModule are global.
 */
@Global()
@Module({
  imports: [UsersModule],
  providers: [SheetsService, IntegrationSettingsService],
  controllers: [IntegrationsController],
  exports: [SheetsService, IntegrationSettingsService],
})
export class IntegrationsModule {}
