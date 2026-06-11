import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { UsersService } from './users.service';
import { ScopeService } from '../common/scope.service';
import { Audit, CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  AssignRolesDto,
  CreateUserDto,
  SetActiveDto,
  UpdateUserDto,
} from './dto';
import { ReorderDto } from '../common/reorder.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly scope: ScopeService,
  ) {}

  /** Scope-selector source: only users the viewer is allowed to see. */
  @Get('selectable')
  async selectable(@CurrentUser() user: AuthUser) {
    const ids = await this.scope.visibleUserIds(user);
    return this.users.selectable(ids);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get()
  list(@CurrentUser() _user: AuthUser) {
    return this.users.listAll();
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_CREATED', entity: 'User' })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  /** Persist drag-and-drop row order (declared before :id routes). */
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Patch('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.users.reorder(dto.ids);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_UPDATED', entity: 'User' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_DELETED', entity: 'User' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_ACTIVE_CHANGED', entity: 'User' })
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(id, dto.isActive);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_ROLES_ASSIGNED', entity: 'User' })
  @Post(':id/roles')
  assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    return this.users.assignRoles(id, dto.roleKeys);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'USER_ROLE_REMOVED', entity: 'User' })
  @Delete(':id/roles/:role')
  removeRole(@Param('id') id: string, @Param('role') role: string) {
    return this.users.removeRole(id, role);
  }
}
