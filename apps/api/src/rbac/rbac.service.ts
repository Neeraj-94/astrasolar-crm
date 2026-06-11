import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSION_DESCRIPTIONS } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoleDto, UpdateRoleDto } from './dto';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async createRole(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new BadRequestException('Role name already exists');
    const perms = await this.resolvePermissionIds(dto.permissionKeys);
    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        isSystem: false,
        permissions: { create: perms.map((id) => ({ permissionId: id })) },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.permissionKeys) {
      const permIds = await this.resolvePermissionIds(dto.permissionKeys);
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: permIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        }),
      ]);
    }
    return this.prisma.role.update({
      where: { id },
      // Only touch description when it was provided, so editing permissions
      // alone doesn't wipe an existing description.
      data:
        dto.description !== undefined
          ? { description: dto.description }
          : {},
      include: { permissions: { include: { permission: true } } },
    });
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.userRole.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const known = new Set(Object.keys(PERMISSION_DESCRIPTIONS));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown permission key(s): ${unknown.join(', ')}`,
      );
    }
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    return perms.map((p) => p.id);
  }
}
