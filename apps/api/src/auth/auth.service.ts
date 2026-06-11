import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import type { RegisterDto } from './dto';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  async login(user: { id: string; email: string }): Promise<IssuedTokens> {
    const tokens = await this.issueTokens(user.id, user.email);
    await this.users.setRefreshToken(
      user.id,
      await bcrypt.hash(tokens.refreshToken, 10),
    );
    return tokens;
  }

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const user = await this.users.create(dto);
    return this.login({ id: user.id, email: user.email });
  }

  async refresh(userId: string, presentedToken: string): Promise<IssuedTokens> {
    const user = await this.users.findById(userId);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Refresh denied');
    }
    const ok = await bcrypt.compare(presentedToken, user.refreshToken);
    if (!ok) throw new UnauthorizedException('Refresh denied');
    return this.login({ id: user.id, email: user.email });
  }

  async logout(userId: string) {
    await this.users.setRefreshToken(userId, null);
  }

  /** Verify a refresh JWT and return its subject. */
  verifyRefresh(token: string): { sub: string; email: string } {
    try {
      return this.jwt.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(
    sub: string,
    email: string,
  ): Promise<IssuedTokens> {
    const payload = { sub, email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'change-me-access',
      expiresIn: process.env.JWT_ACCESS_TTL || '900s',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });
    return { accessToken, refreshToken };
  }
}
