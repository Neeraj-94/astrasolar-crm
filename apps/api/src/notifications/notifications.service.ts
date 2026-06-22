import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal delegate surface for the `Notification` model. The Prisma client is
 * generated to `prisma/generated/client`; in environments where it has already
 * been regenerated against the Notification model this matches the real
 * delegate. We reference it through this narrow interface so the module is
 * decoupled from the (large) generated types and compiles even before the
 * client is regenerated. After `prisma generate`, `prisma.notification` exists
 * at runtime and satisfies this shape.
 */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
  actorId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationDelegate {
  create(args: { data: Record<string, unknown> }): Promise<NotificationRecord>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    take?: number;
  }): Promise<NotificationRecord[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
  update(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<NotificationRecord>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: {
    where: Record<string, unknown>;
  }): Promise<NotificationRecord | null>;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  data?: unknown;
  actorId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Typed handle to the generated Notification delegate (see note above). */
  private get model(): NotificationDelegate {
    return (this.prisma as unknown as { notification: NotificationDelegate })
      .notification;
  }

  /**
   * Create a notification for a recipient. Optional `tx` lets callers enrol the
   * write in their own transaction so the notification can't be created without
   * the change that triggered it (and vice-versa).
   */
  async create(input: CreateNotificationInput, tx?: unknown) {
    const client = (tx ?? this.prisma) as unknown as {
      notification: NotificationDelegate;
    };
    return client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        data: input.data ?? undefined,
        actorId: input.actorId ?? null,
      },
    });
  }

  /** The current user's notifications, newest first. */
  async listForUser(userId: string, opts: { unreadOnly?: boolean } = {}) {
    return this.model.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Count of the current user's unread notifications (for the bell badge). */
  async unreadCount(userId: string) {
    const count = await this.model.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /** Mark one notification read — only the recipient may do so. */
  async markRead(userId: string, id: string) {
    const existing = await this.model.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (existing.readAt) return existing;
    return this.model.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Mark all of the current user's notifications read. */
  async markAllRead(userId: string) {
    return this.model.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
