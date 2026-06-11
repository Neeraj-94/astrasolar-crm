import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleKeys?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class AssignRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleKeys!: string[];
}
