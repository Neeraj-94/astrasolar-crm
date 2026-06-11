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
import { RbacService } from './rbac.service';
import { Audit, RequirePermissions } from '../common/decorators';
import { CreateRoleDto, UpdateRoleDto } from './dto';

@ApiTags('rbac')
@Controller('rbac')
@RequirePermissions(PERMISSIONS.ROLES_MANAGE)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  permissions() {
    return this.rbac.listPermissions();
  }

  @Get('roles')
  roles() {
    return this.rbac.listRoles();
  }

  @Audit({ action: 'ROLE_CREATED', entity: 'Role' })
  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.rbac.createRole(dto);
  }

  @Audit({ action: 'ROLE_UPDATED', entity: 'Role' })
  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbac.updateRole(id, dto);
  }

  @Audit({ action: 'ROLE_DELETED', entity: 'Role' })
  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.rbac.deleteRole(id);
  }
}
