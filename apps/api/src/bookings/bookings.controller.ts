import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { PERMISSIONS } from '@astra/shared';
import { BookingsService } from './bookings.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

class RescheduleDto {
  @IsDateString()
  scheduledAt!: string;
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.bookings.list(user, userId);
  }

  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.bookings.reschedule(user, id, dto.scheduledAt);
  }
}
