import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@astra/shared';
import { AuthService, IssuedTokens } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import {
  ChangePasswordDto,
  RegisterDto,
  UpdateAvatarDto,
  UpdateProfileDto,
} from './dto';
import { UsersService } from '../users/users.service';
import {
  Audit,
  CurrentUser,
  Public,
  RequirePermissions,
} from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const principal = req.user as { id: string; email: string };
    const tokens = await this.auth.login(principal);
    this.setCookies(res, tokens);
    return this.me(principal.id);
  }

  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // Staff creation is Super-Admin-only (users:manage). Returns the new user.
    const tokens = await this.auth.register(dto);
    return { ok: true, issued: Boolean(tokens.accessToken) };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('No refresh token');
    const { sub } = this.auth.verifyRefresh(token);
    const tokens = await this.auth.refresh(sub, token);
    this.setCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  async logout(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(userId);
    this.clearCookies(res);
    return { ok: true };
  }

  @Get('me')
  async meHandler(@CurrentUser() user: AuthUser) {
    return this.me(user.id, user);
  }

  /** Self-service profile update (display name + phone numbers). */
  @Audit({ action: 'PROFILE_UPDATED', entity: 'User' })
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.users.updateProfile(user.id, dto);
    return this.me(user.id);
  }

  /** Persist a new avatar URL (the web app handles the file upload). */
  @Audit({ action: 'PROFILE_AVATAR_UPDATED', entity: 'User' })
  @Patch('profile/avatar')
  async updateAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAvatarDto,
  ) {
    await this.users.updateAvatar(user.id, dto.avatarUrl);
    return this.me(user.id);
  }

  /** Self-service password change (requires the current password). */
  @Audit({ action: 'PROFILE_PASSWORD_CHANGED', entity: 'User' })
  @Post('profile/password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  // ---- helpers ----

  private async me(userId: string, principal?: AuthUser) {
    const user = principal ?? (await this.users.buildAuthUser(userId));
    if (!user) throw new UnauthorizedException();
    const record = await this.users.findById(userId);
    return {
      ...this.serialize(user),
      avatarUrl: record?.avatarUrl ?? null,
      phones: record?.phones ?? [],
      region: record?.region ?? null,
    };
  }

  private serialize(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      teamId: user.teamId,
      roleKeys: user.roleKeys,
      permissions: [...user.permissions],
      scope: user.scope,
    };
  }

  private cookieOpts(maxAge: number) {
    const secure = process.env.COOKIE_SECURE === 'true';
    return {
      httpOnly: true,
      secure,
      sameSite: secure ? ('none' as const) : ('lax' as const),
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
      maxAge,
    };
  }

  private setCookies(res: Response, tokens: IssuedTokens) {
    res.cookie('access_token', tokens.accessToken, this.cookieOpts(ACCESS_MAX_AGE));
    res.cookie(
      'refresh_token',
      tokens.refreshToken,
      this.cookieOpts(REFRESH_MAX_AGE),
    );
  }

  private clearCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
