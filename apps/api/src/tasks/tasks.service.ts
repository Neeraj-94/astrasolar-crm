import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISSIONS,
  TASK_ASSIGNABLE_ROLES,
  type RoleKey,
} from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import type {
  CreateTaskDto,
  MoveTaskDto,
  TaskBoardKeyValue,
  UpdateTaskDto,
} from './dto';

/**
 * Trello-style task boards — one SHARED board per dashboard. A user may use a
 * board iff they can open the dashboard that owns it (same permission that
 * gates the dashboard shell), so board access tracks RBAC automatically.
 */
const BOARD_PERMISSION: Record<TaskBoardKeyValue, string> = {
  leads: PERMISSIONS.DASHBOARD_LEADGEN,
  sales: PERMISSIONS.DASHBOARD_CONSULTANT,
  'sales-manager': PERMISSIONS.DASHBOARD_SALES,
  'operations-manager': PERMISSIONS.DASHBOARD_OPERATIONS,
  admin: PERMISSIONS.DASHBOARD_ADMIN_OFFICER,
};

const DEFAULT_LISTS = ['To Do', 'In Progress', 'Done'];

const toIsoDate = (d: Date | null) =>
  d ? d.toISOString().slice(0, 10) : null;

const CARD_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  nudgedBy: { select: { id: true, name: true } },
} as const;

/** Minimum gap between nudges on the same task. */
const NUDGE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -- access -----------------------------------------------------------------

  assertBoardAccess(user: AuthUser, board: TaskBoardKeyValue) {
    const required = BOARD_PERMISSION[board];
    if (!required || !user.permissions.has(required)) {
      throw new ForbiddenException(`No access to the "${board}" task board`);
    }
  }

  // -- assignment policy --------------------------------------------------------

  /** Union of role keys this user may assign tasks to (self always allowed). */
  private assignableRoleKeys(user: AuthUser): Set<RoleKey> {
    const out = new Set<RoleKey>();
    for (const rk of user.roleKeys) {
      const allowed = TASK_ASSIGNABLE_ROLES[rk as RoleKey];
      if (allowed) for (const a of allowed) out.add(a);
    }
    return out;
  }

  /** Active users the current user may assign tasks to (always includes self). */
  async listAssignees(user: AuthUser) {
    const allowed = this.assignableRoleKeys(user);

    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { id: user.id },
          ...(allowed.size
            ? [{ roles: { some: { role: { name: { in: [...allowed] } } } } }]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      roleKeys: u.roles.map((r) => r.role.name),
    }));
  }

  /** True iff the user may assign tasks to `assigneeId` (self always ok). */
  private async canAssignTo(
    user: AuthUser,
    assigneeId: string,
  ): Promise<boolean> {
    if (assigneeId === user.id) return true;

    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: {
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!assignee || !assignee.isActive) {
      throw new NotFoundException('Assignee not found');
    }

    const allowed = this.assignableRoleKeys(user);
    return assignee.roles.some((r) => allowed.has(r.role.name as RoleKey));
  }

  /** Throws unless the user may assign tasks to `assigneeId`. */
  private async assertCanAssign(user: AuthUser, assigneeId: string) {
    if (!(await this.canAssignTo(user, assigneeId))) {
      throw new ForbiddenException(
        'You are not allowed to assign tasks to this user',
      );
    }
  }

  // -- board ------------------------------------------------------------------

  async getBoard(user: AuthUser, board: TaskBoardKeyValue) {
    this.assertBoardAccess(user, board);
    await this.ensureDefaultLists(board, user.id);

    const lists = await this.prisma.taskList.findMany({
      where: { dashboardKey: board },
      orderBy: { position: 'asc' },
      include: {
        tasks: { orderBy: { position: 'asc' }, include: CARD_INCLUDE },
      },
    });

    return {
      board,
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        tasks: l.tasks.map((t) => this.serializeCard(t)),
      })),
    };
  }

  /** First open of a board seeds the classic three columns. */
  private async ensureDefaultLists(board: TaskBoardKeyValue, userId: string) {
    const count = await this.prisma.taskList.count({
      where: { dashboardKey: board },
    });
    if (count > 0) return;
    await this.prisma.taskList.createMany({
      data: DEFAULT_LISTS.map((name, i) => ({
        dashboardKey: board,
        name,
        position: i,
        createdById: userId,
      })),
    });
  }

  // -- lists ------------------------------------------------------------------

  async createList(user: AuthUser, board: TaskBoardKeyValue, name: string) {
    this.assertBoardAccess(user, board);
    const last = await this.prisma.taskList.aggregate({
      where: { dashboardKey: board },
      _max: { position: true },
    });
    const list = await this.prisma.taskList.create({
      data: {
        dashboardKey: board,
        name: name.trim(),
        position: (last._max.position ?? -1) + 1,
        createdById: user.id,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'TASKLIST_CREATED',
      entity: 'TaskList',
      entityId: list.id,
      metadata: { board, name: list.name },
    });
    return { id: list.id, name: list.name, position: list.position, tasks: [] };
  }

  async renameList(user: AuthUser, id: string, name: string) {
    const list = await this.requireList(user, id);
    await this.prisma.taskList.update({
      where: { id: list.id },
      data: { name: name.trim() },
    });
    return { ok: true };
  }

  async reorderLists(user: AuthUser, board: TaskBoardKeyValue, ids: string[]) {
    this.assertBoardAccess(user, board);
    const lists = await this.prisma.taskList.findMany({
      where: { dashboardKey: board },
      select: { id: true },
    });
    const valid = new Set(lists.map((l) => l.id));
    const ordered = ids.filter((id) => valid.has(id));
    await this.prisma.$transaction(
      ordered.map((id, position) =>
        this.prisma.taskList.update({ where: { id }, data: { position } }),
      ),
    );
    return { ok: true };
  }

  async deleteList(user: AuthUser, id: string) {
    const list = await this.requireList(user, id);
    await this.prisma.taskList.delete({ where: { id: list.id } }); // cascades to cards
    await this.audit.record({
      userId: user.id,
      action: 'TASKLIST_DELETED',
      entity: 'TaskList',
      entityId: list.id,
      metadata: { board: list.dashboardKey, name: list.name },
    });
    return { ok: true };
  }

  // -- tasks ------------------------------------------------------------------

  async createTask(user: AuthUser, dto: CreateTaskDto) {
    this.assertBoardAccess(user, dto.board);
    const list = await this.prisma.taskList.findUnique({
      where: { id: dto.listId },
    });
    if (!list || list.dashboardKey !== dto.board) {
      throw new NotFoundException('List not found on this board');
    }
    if (dto.assigneeId) await this.assertCanAssign(user, dto.assigneeId);

    const last = await this.prisma.taskCard.aggregate({
      where: { listId: list.id },
      _max: { position: true },
    });

    const task = await this.prisma.taskCard.create({
      data: {
        listId: list.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null,
        assigneeId: dto.assigneeId || null,
        createdById: user.id,
        position: (last._max.position ?? -1) + 1,
      },
      include: CARD_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'TASK_CREATED',
      entity: 'TaskCard',
      entityId: task.id,
      metadata: { board: dto.board, list: list.name, title: task.title },
    });
    return this.serializeCard(task);
  }

  async updateTask(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const { task } = await this.requireTask(user, id);
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      await this.assertCanAssign(user, dto.assigneeId);
    }

    // The assignee acting on the card (or a reassignment) clears the nudge.
    const assigneeChanged =
      dto.assigneeId !== undefined &&
      (dto.assigneeId || null) !== task.assigneeId;
    const clearNudge =
      task.nudgedAt !== null &&
      (user.id === task.assigneeId || assigneeChanged);

    const updated = await this.prisma.taskCard.update({
      where: { id: task.id },
      data: {
        ...(clearNudge ? { nudgedAt: null, nudgedById: null } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined
          ? {
              dueDate: dto.dueDate
                ? new Date(`${dto.dueDate}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(dto.assigneeId !== undefined
          ? { assigneeId: dto.assigneeId || null }
          : {}),
      },
      include: CARD_INCLUDE,
    });
    return this.serializeCard(updated);
  }

  /**
   * Drag & drop: place the card at `position` inside `listId` (same or other
   * list) and compact positions in every affected list — one transaction.
   */
  async moveTask(user: AuthUser, id: string, dto: MoveTaskDto) {
    const { task, list: fromList } = await this.requireTask(user, id);

    const toList = await this.prisma.taskList.findUnique({
      where: { id: dto.listId },
    });
    if (!toList || toList.dashboardKey !== fromList.dashboardKey) {
      throw new NotFoundException('Target list not found on this board');
    }

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.taskCard.findMany({
        where: { listId: toList.id },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      const ids = target.map((t) => t.id).filter((tid) => tid !== task.id);
      const clamped = Math.max(0, Math.min(dto.position, ids.length));
      ids.splice(clamped, 0, task.id);

      await tx.taskCard.update({
        where: { id: task.id },
        data: {
          listId: toList.id,
          // The assignee moving their own card counts as acting on it.
          ...(user.id === task.assigneeId && task.nudgedAt
            ? { nudgedAt: null, nudgedById: null }
            : {}),
        },
      });
      for (let i = 0; i < ids.length; i++) {
        await tx.taskCard.update({
          where: { id: ids[i] },
          data: { position: i },
        });
      }

      // Compact the source list when the card changed columns.
      if (fromList.id !== toList.id) {
        const source = await tx.taskCard.findMany({
          where: { listId: fromList.id },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        for (let i = 0; i < source.length; i++) {
          await tx.taskCard.update({
            where: { id: source[i].id },
            data: { position: i },
          });
        }
      }
    });

    if (fromList.id !== toList.id) {
      await this.audit.record({
        userId: user.id,
        action: 'TASK_MOVED',
        entity: 'TaskCard',
        entityId: task.id,
        metadata: {
          board: fromList.dashboardKey,
          from: fromList.name,
          to: toList.name,
          title: task.title,
        },
      });
    }
    return { ok: true };
  }

  /**
   * Nudge the assignee: anyone who could have assigned the task to its current
   * assignee (or the task's creator) may nudge — at most once per hour per
   * task. In-app only: the card carries a "nudged" indicator until the
   * assignee acts on it (edit or move clears it).
   */
  async nudgeTask(user: AuthUser, id: string) {
    const { task, list } = await this.requireTask(user, id);

    if (!task.assigneeId) {
      throw new ForbiddenException('This task has no assignee to nudge');
    }
    if (task.assigneeId === user.id) {
      throw new ForbiddenException('You cannot nudge yourself');
    }

    const isCreator = task.createdById === user.id;
    if (!isCreator && !(await this.canAssignTo(user, task.assigneeId))) {
      throw new ForbiddenException(
        'Only the task creator or someone who can assign to this user may nudge',
      );
    }

    if (
      task.nudgedAt &&
      Date.now() - task.nudgedAt.getTime() < NUDGE_COOLDOWN_MS
    ) {
      const minutesLeft = Math.ceil(
        (NUDGE_COOLDOWN_MS - (Date.now() - task.nudgedAt.getTime())) / 60000,
      );
      throw new HttpException(
        `This task was nudged recently — try again in ${minutesLeft} min`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const updated = await this.prisma.taskCard.update({
      where: { id: task.id },
      data: { nudgedAt: new Date(), nudgedById: user.id },
      include: CARD_INCLUDE,
    });

    await this.audit.record({
      userId: user.id,
      action: 'TASK_NUDGED',
      entity: 'TaskCard',
      entityId: task.id,
      metadata: {
        board: list.dashboardKey,
        title: task.title,
        assigneeId: task.assigneeId,
      },
    });
    return this.serializeCard(updated);
  }

  async deleteTask(user: AuthUser, id: string) {
    const { task, list } = await this.requireTask(user, id);
    await this.prisma.taskCard.delete({ where: { id: task.id } });
    await this.audit.record({
      userId: user.id,
      action: 'TASK_DELETED',
      entity: 'TaskCard',
      entityId: task.id,
      metadata: { board: list.dashboardKey, list: list.name, title: task.title },
    });
    return { ok: true };
  }

  // -- helpers ----------------------------------------------------------------

  private async requireList(user: AuthUser, id: string) {
    const list = await this.prisma.taskList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('List not found');
    this.assertBoardAccess(user, list.dashboardKey as TaskBoardKeyValue);
    return list;
  }

  private async requireTask(user: AuthUser, id: string) {
    const task = await this.prisma.taskCard.findUnique({
      where: { id },
      include: { list: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    this.assertBoardAccess(
      user,
      task.list.dashboardKey as TaskBoardKeyValue,
    );
    return { task, list: task.list };
  }

  private serializeCard(t: {
    id: string;
    listId: string;
    title: string;
    description: string | null;
    priority: string;
    dueDate: Date | null;
    position: number;
    assignee: { id: string; name: string } | null;
    createdBy: { id: string; name: string };
    nudgedAt: Date | null;
    nudgedBy: { id: string; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: t.id,
      listId: t.listId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: toIsoDate(t.dueDate),
      position: t.position,
      assignee: t.assignee,
      createdBy: t.createdBy,
      nudge:
        t.nudgedAt && t.nudgedBy
          ? { at: t.nudgedAt.toISOString(), by: t.nudgedBy }
          : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
