import { Module } from '@nestjs/common';
import { NovaModule } from '../nova/nova.module';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './checklist.controller';

/**
 * Per-lead system-recommendation checklist. Imports NovaModule to reuse
 * NovaRecommendationService (the system AI that returns the 5 packages).
 * PrismaService, ScopeService and AuditService are global, so they need no
 * import here.
 */
@Module({
  imports: [NovaModule],
  controllers: [ChecklistController],
  providers: [ChecklistService],
})
export class ChecklistModule {}
