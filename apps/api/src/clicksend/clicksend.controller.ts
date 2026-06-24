import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  ClickSendService,
  ClickSendDeliveryReceipt,
} from './clicksend.service';
import { SendSmsDto } from './dto';

@ApiTags('integrations:clicksend')
@Controller('integrations/clicksend')
export class ClickSendController {
  constructor(
    private readonly clicksend: ClickSendService,
    private readonly config: ConfigService,
  ) {}

  /** Send an outbound SMS to a lead/number. Gated by messaging:send. */
  @RequirePermissions(PERMISSIONS.MESSAGING_SEND)
  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendSmsDto) {
    return this.clicksend.sendSms(user, dto);
  }

  /**
   * ClickSend delivery-receipt webhook. Public (no JWT) — ClickSend can't
   * authenticate, so we verify a shared secret passed as `?token=` that must
   * match CLICKSEND_WEBHOOK_TOKEN. Configure this URL in the ClickSend dashboard.
   */
  @Public()
  @Post('webhook/delivery')
  deliveryReceipt(
    @Query('token') token: string,
    @Body() body: ClickSendDeliveryReceipt,
  ) {
    const expected = this.config.get<string>('CLICKSEND_WEBHOOK_TOKEN');
    if (expected && token !== expected) {
      throw new BadRequestException('Invalid webhook token.');
    }
    return this.clicksend.handleDeliveryReceipt(body ?? {});
  }
}
