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
import { LeadsModule } from './leads/leads.module';
import { BookingsModule } from './bookings/bookings.module';
import { SalesModule } from './sales/sales.module';
import { ProductsModule } from './products/products.module';
import { InstallationsModule } from './installations/installations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FinancialsModule } from './financials/financials.module';
import { AuditReadModule } from './audit/audit.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { StorageModule } from './storage/storage.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CustomerModule } from './customer/customer.module';
import { NovaModule } from './nova/nova.module';
import { ChecklistModule } from './checklist/checklist.module';
import { ConsultantContactsModule } from './consultant-contacts/consultant-contacts.module';
import { BlacklistModule } from './blacklist/blacklist.module';
import { ClickSendModule } from './clicksend/clicksend.module';
import { AircallModule } from './aircall/aircall.module';

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
    LeadsModule,
    BookingsModule,
    SalesModule,
    ProductsModule,
    InstallationsModule,
    AnalyticsModule,
    FinancialsModule,
    AuditReadModule,
    IntegrationsModule,
    StorageModule,
    SchedulingModule,
    TasksModule,
    NotificationsModule,
    CustomerModule,
    NovaModule,
    ChecklistModule,
    ConsultantContactsModule,
    BlacklistModule,
    ClickSendModule,
    AircallModule,
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
