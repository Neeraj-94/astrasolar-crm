import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import {
  CompatibilityController,
  ProductsController,
} from './products.controller';

@Module({
  providers: [ProductsService],
  controllers: [ProductsController, CompatibilityController],
  exports: [ProductsService],
})
export class ProductsModule {}
