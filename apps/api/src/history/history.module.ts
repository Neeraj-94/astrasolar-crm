import { Global, Module } from '@nestjs/common';
import { LeadHistoryService } from './lead-history.service';
import { SaleHistoryService } from './sale-history.service';
import { ProductHistoryService } from './product-history.service';

@Global()
@Module({
  providers: [LeadHistoryService, SaleHistoryService, ProductHistoryService],
  exports: [LeadHistoryService, SaleHistoryService, ProductHistoryService],
})
export class HistoryModule {}
