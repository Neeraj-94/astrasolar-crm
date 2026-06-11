import { Module } from '@nestjs/common';
import { InstallationsService } from './installations.service';
import { InstallationsController } from './installations.controller';

@Module({
  providers: [InstallationsService],
  controllers: [InstallationsController],
  exports: [InstallationsService],
})
export class InstallationsModule {}
