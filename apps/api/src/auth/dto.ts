import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleKeys?: string[];

  @IsOptional()
  @IsString()
  teamId?: string;
}

// ---- self-service profile -----------------------------------------------

export class ProfilePhoneDto {
  @IsString()
  label!: string; // mobile | work | home | other

  @IsString()
  @MaxLength(40)
  number!: string;

  @IsBoolean()
  isPrimary!: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProfilePhoneDto)
  phones?: ProfilePhoneDto[];
}

export class UpdateAvatarDto {
  @IsString()
  @MaxLength(2048)
  avatarUrl!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
