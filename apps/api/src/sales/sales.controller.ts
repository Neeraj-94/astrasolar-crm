import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { SalesService } from './sales.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  AddExtraDto,
  CreateSaleFormDto,
  UpdatePaymentDetailsDto,
  UpdateSaleCoreDto,
  UpdateSaleStatusDto,
  UpdateStatusDetailsDto,
  UpdateSystemDetailsDto,
} from './dto';
import { ReorderDto } from '../common/reorder.dto';

@ApiTags('sales')
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // Managers/finance/ceo can READ team sales; consultants see their own.
  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.sales.list(user, userId);
  }

  /** Create a Sale from the "Generate Sales Form" wizard. */
  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleFormDto) {
    return this.sales.createFromForm(user, dto);
  }

  /** Persist drag-and-drop row order (declared before :id routes). */
  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch('reorder')
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderDto) {
    return this.sales.reorder(user, dto.ids);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.sales.get(id);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSaleStatusDto,
  ) {
    return this.sales.updateStatus(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch(':id/core')
  updateCore(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSaleCoreDto,
  ) {
    return this.sales.updateCore(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch(':id/system-details')
  updateSystemDetails(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSystemDetailsDto,
  ) {
    return this.sales.updateSystemDetails(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch(':id/status-details')
  updateStatusDetails(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDetailsDto,
  ) {
    return this.sales.updateStatusDetails(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Patch(':id/payment-details')
  updatePaymentDetails(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDetailsDto,
  ) {
    return this.sales.updatePaymentDetails(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_MANAGE_OWN)
  @Post(':id/extras')
  addExtra(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddExtraDto,
  ) {
    return this.sales.addExtra(user, id, dto);
  }
}
