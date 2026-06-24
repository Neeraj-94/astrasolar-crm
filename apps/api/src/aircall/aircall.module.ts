import { Module } from '@nestjs/common';
import { AircallService } from './aircall.service';
import { AircallController } from './aircall.controller';

/**
 * Aircall integration — inbound call-event webhook + outbound click-to-dial.
 * PrismaModule is global; AuditService comes from CommonModule (global).
 */
@Module({
  providers: [AircallService],
  controllers: [AircallController],
  exports: [AircallService],
})
export class AircallModule {}
