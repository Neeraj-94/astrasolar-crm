import { Module } from '@nestjs/common';
import { FinancialsService } from './financials.service';
import { FinancialsController } from './financials.controller';

@Module({
  providers: [FinancialsService],
  controllers: [FinancialsController],
  exports: [FinancialsService],
})
export class FinancialsModule {}
