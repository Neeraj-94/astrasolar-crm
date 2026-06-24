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
import { AircallService, AircallWebhook } from './aircall.service';
import { ClickToDialDto } from './dto';

@ApiTags('integrations:aircall')
@Controller('integrations/aircall')
export class AircallController {
  constructor(
    private readonly aircall: AircallService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Aircall webhook. Public (no JWT). Aircall includes the webhook `token` in
   * the payload; we also accept it as `?token=`. Either must match
   * AIRCALL_WEBHOOK_TOKEN when set. Configure this URL on the Aircall webhook.
   */
  @Public()
  @Post('webhook')
  webhook(@Query('token') queryToken: string, @Body() body: AircallWebhook) {
    const expected = this.config.get<string>('AIRCALL_WEBHOOK_TOKEN');
    if (expected && body?.token !== expected && queryToken !== expected) {
      throw new BadRequestException('Invalid webhook token.');
    }
    return this.aircall.handleWebhook(body ?? {});
  }

  /** Place an outbound call (click-to-dial). Gated by messaging:send. */
  @RequirePermissions(PERMISSIONS.MESSAGING_SEND)
  @Post('dial')
  dial(@CurrentUser() user: AuthUser, @Body() dto: ClickToDialDto) {
    return this.aircall.clickToDial(user, dto);
  }
}
