import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, userId?: string) {
    const { ids } = await this.scope.resolveTargetUserIds(user, userId);
    const where = ids === 'all' ? {} : { consultantId: { in: ids } };
    return this.prisma.booking.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        consultant: { select: { id: true, name: true } },
        bookedBy: { select: { id: true, name: true } },
        lead: true,
      },
    });
  }

  async reschedule(user: AuthUser, id: string, scheduledAt: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        rescheduledFrom: booking.scheduledAt,
        scheduledAt: new Date(scheduledAt),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'BOOKING_RESCHEDULED',
      entity: 'Booking',
      entityId: id,
    });
    return updated;
  }
}
