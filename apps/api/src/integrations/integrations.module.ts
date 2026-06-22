import { Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { IntegrationsController } from './integrations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [SheetsService],
  controllers: [IntegrationsController],
  exports: [SheetsService],
})
export class IntegrationsModule {}
