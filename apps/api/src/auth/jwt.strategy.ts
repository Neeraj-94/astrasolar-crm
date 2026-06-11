import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import type { AuthUser } from '../common/auth-user';

export interface JwtPayload {
  sub: string;
  email: string;
}

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'change-me-access',
    });
  }

  /** Loads the user + all roles, returning the request principal. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.buildAuthUser(payload.sub);
    if (!user) throw new UnauthorizedException('Account inactive or not found');
    return user;
  }
}
