import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { InstallationsService } from './installations.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { AssignInstallerDto, UpdateInstallationDto } from './dto';
import { ReorderDto } from '../common/reorder.dto';

@ApiTags('installations')
@Controller('installations')
export class InstallationsController {
  constructor(private readonly installs: InstallationsService) {}

  @RequirePermissions(PERMISSIONS.INSTALLS_READ_OWN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.installs.list(user, userId);
  }

  /** Persist drag-and-drop row order (declared before :id routes). */
  @RequirePermissions(PERMISSIONS.INSTALLS_WRITE_OWN)
  @Patch('reorder')
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderDto) {
    return this.installs.reorder(user, dto.ids);
  }

  @RequirePermissions(PERMISSIONS.INSTALLS_READ_OWN)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.installs.get(id);
  }

  // Ops assigns the installer onto a sale.
  @RequirePermissions(PERMISSIONS.INSTALLS_WRITE_OWN)
  @Post('sale/:saleId/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('saleId') saleId: string,
    @Body() dto: AssignInstallerDto,
  ) {
    return this.installs.assign(user, saleId, dto);
  }

  @RequirePermissions(PERMISSIONS.INSTALLS_WRITE_OWN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInstallationDto,
  ) {
    return this.installs.update(user, id, dto);
  }
}
