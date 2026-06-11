import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HistoryModule } from './history/history.module';
import { MailModule } from './mail/mail.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { ContactsModule } from './contacts/contacts.module';
import { LeadsModule } from './leads/leads.module';
import { BookingsModule } from './bookings/bookings.module';
import { SalesModule } from './sales/sales.module';
import { ProductsModule } from './products/products.module';
import { InstallationsModule } from './installations/installations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditReadModule } from './audit/audit.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { StorageModule } from './storage/storage.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    HistoryModule,
    MailModule,
    AuthModule,
    UsersModule,
    RbacModule,
    ContactsModule,
    LeadsModule,
    BookingsModule,
    SalesModule,
    ProductsModule,
    InstallationsModule,
    AnalyticsModule,
    AuditReadModule,
    IntegrationsModule,
    StorageModule,
  ],
  providers: [
    // The authorization pipeline runs globally, in order:
    //   1. JwtAuthGuard      (authenticate + load user & roles)
    //   2. PermissionsGuard  (@RequirePermissions capability gate)
    // Row-scope + ownership are enforced inside services (ScopeService /
    // assertOwnership) since they need the query/record.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
