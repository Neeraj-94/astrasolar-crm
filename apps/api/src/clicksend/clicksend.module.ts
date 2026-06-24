import { Module } from '@nestjs/common';
import { ClickSendService } from './clicksend.service';
import { ClickSendController } from './clicksend.controller';

/**
 * ClickSend SMS integration — outbound send + delivery-receipt webhook.
 * PrismaModule is global; AuditService comes from CommonModule (global).
 */
@Module({
  providers: [ClickSendService],
  controllers: [ClickSendController],
  exports: [ClickSendService],
})
export class ClickSendModule {}
