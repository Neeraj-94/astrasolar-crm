import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { AuditService } from './audit.service';

/**
 * Cross-cutting services available app-wide: row-visibility scope resolution
 * and the audit trail writer.
 */
@Global()
@Module({
  providers: [ScopeService, AuditService],
  exports: [ScopeService, AuditService],
})
export class CommonModule {}
