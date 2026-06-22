import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AppointmentsService } from './appointments.service';
import { SchedulingController } from './scheduling.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [AvailabilityService, AppointmentsService],
  controllers: [SchedulingController],
  exports: [AvailabilityService, AppointmentsService],
})
export class SchedulingModule {}
