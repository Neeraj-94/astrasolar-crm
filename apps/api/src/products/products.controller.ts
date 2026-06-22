import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { ProductsService } from './products.service';
import { Audit, CurrentUser, RequirePermissions } from '../common/decorators';
import { ReorderDto } from '../common/reorder.dto';
import type {
  BatteryPriceInput,
  CatalogueInput,
  ComboPriceInput,
  CompatInput,
} from './dto';

/**
 * Catalogue API — one resource per table under /products/<type> where type is
 * solar | battery | inverter | extras. Static sub-routes (battery prices,
 * reorder) are declared BEFORE the `:type/:id` param routes so they win.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // Aggregate priced-battery matrix for the price calculator: every ACTIVE
  // battery + its active inverter combos + per-context RRP, in ONE call.
  // Declared before `:type` so "battery-priced" isn't read as a catalogue type.
  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('battery-priced')
  pricedBatteries() {
    return this.products.pricedBatteries();
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('battery/:id/prices')
  prices(@Param('id') id: string) {
    return this.products.listBatteryPrices(id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'BATTERY_PRICE_UPDATED', entity: 'BatteryContextPrice' })
  @Put('battery/:id/prices')
  upsertPrice(
    @Param('id') id: string,
    @Body() dto: BatteryPriceInput,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.upsertBatteryPrice(id, dto, userId);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('battery/:id/combos')
  combos(@Param('id') id: string) {
    return this.products.listBatteryCombos(id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({
    action: 'BATTERY_COMBO_PRICE_UPDATED',
    entity: 'BatteryComboContextPrice',
  })
  @Put('combo/:compatId/prices')
  upsertComboPrice(
    @Param('compatId') compatId: string,
    @Body() dto: ComboPriceInput,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.upsertComboPrice(compatId, dto, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Patch(':type/reorder')
  reorder(@Param('type') type: string, @Body() dto: ReorderDto) {
    return this.products.reorder(type, dto.ids);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':type')
  list(@Param('type') type: string, @Query('all') all?: string) {
    return this.products.list(type, all === 'true');
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':type/:id')
  get(@Param('type') type: string, @Param('id') id: string) {
    return this.products.get(type, id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_CREATED', entity: 'Product' })
  @Post(':type')
  create(@Param('type') type: string, @Body() dto: CatalogueInput) {
    return this.products.create(type, dto);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_UPDATED', entity: 'Product' })
  @Patch(':type/:id')
  update(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: CatalogueInput,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.update(type, id, dto, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_STATUS_CHANGED', entity: 'Product' })
  @Post(':type/:id/:action')
  action(
    @Param('type') type: string,
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.products.statusAction(type, id, action, userId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'PRODUCT_DELETED', entity: 'Product' })
  @Delete(':type/:id')
  remove(@Param('type') type: string, @Param('id') id: string) {
    return this.products.remove(type, id);
  }
}

/**
 * Battery <-> inverter compatibility allow-list. Separate path so it never
 * collides with /products/:type.
 */
@ApiTags('compatibility')
@Controller('compatibility')
export class CompatibilityController {
  constructor(private readonly products: ProductsService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get()
  list(@Query('inverterId') inverterId?: string) {
    return this.products.listCompat(inverterId);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'COMPAT_ADDED', entity: 'BatteryInverterCompat' })
  @Post()
  add(@Body() dto: CompatInput) {
    return this.products.addCompat(dto);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'COMPAT_TOGGLED', entity: 'BatteryInverterCompat' })
  @Patch(':id')
  toggle(@Param('id') id: string, @Body() dto: { isActive?: boolean }) {
    return this.products.toggleCompat(id, dto.isActive ?? true);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'COMPAT_REMOVED', entity: 'BatteryInverterCompat' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.products.removeCompat(id);
  }
}
