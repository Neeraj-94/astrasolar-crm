import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { NotificationsService } from './notifications.service';

/**
 * In-app notification centre. Every authenticated staff member can read and
 * clear THEIR OWN notifications, so routes are gated by the baseline staff
 * permission and always scoped to the current user inside the service.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.listForUser(user.id, {
      unreadOnly: unreadOnly === 'true',
    });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('read-all')
  async markAllRead(@CurrentUser() user: AuthUser) {
    const result = await this.notifications.markAllRead(user.id);
    return { ok: true, ...result };
  }
}
