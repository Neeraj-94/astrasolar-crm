import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CustomerService } from './customer.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

/**
 * Customer self-service dashboard endpoints. The whole controller is gated to
 * customer:read:self; the service resolves the caller's own record only.
 */
@ApiTags('customer')
@RequirePermissions(PERMISSIONS.CUSTOMER_READ_SELF)
@Controller('customer')
export class CustomerController {
  constructor(private readonly customer: CustomerService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.customer.overview(user);
  }

  @Get('system')
  system(@CurrentUser() user: AuthUser) {
    return this.customer.system(user);
  }

  @Get('invoices')
  invoices(@CurrentUser() user: AuthUser) {
    return this.customer.invoices(user);
  }

  @Get('support')
  support(@CurrentUser() user: AuthUser) {
    return this.customer.support(user);
  }

  @Post('support')
  createSupport(
    @CurrentUser() user: AuthUser,
    @Body() body: { message?: string },
  ) {
    return this.customer.createSupport(user, body);
  }
}
