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
import { PERMISSIONS, ProductCategory } from '@astra/shared';
import { ProductsService } from './products.service';
import { Audit, CurrentUser, RequirePermissions } from '../common/decorators';
import { ReorderDto } from '../common/reorder.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(
    @Query('category') category?: ProductCategory,
    @Query('all') all?: string,
  ) {
    return all === 'true'
      ? this.products.listAll(category)
      : this.products.listActive(category);
  }

  /** Persist drag-and-drop row order (declared before :id routes). */
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Patch('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.products.reorder(dto.ids);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  // Catalogue management gated by users:manage (back-office / super admin).
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_CREATED', entity: 'Product' })
  @Post()
  create(@Body() dto: any) {
    return this.products.create(dto);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_UPDATED', entity: 'Product' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.update(id, dto, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_DISCONTINUED', entity: 'Product' })
  @Post(':id/discontinue')
  discontinue(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.products.discontinue(id, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_ARCHIVED', entity: 'Product' })
  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.products.archive(id, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_REACTIVATED', entity: 'Product' })
  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.products.reactivate(id, userId);
  }
}
