import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsString()
  firstName!: string;

  @IsString()
  surname!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  streetAddress?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  accountId?: string;
}

export class UpdateContactDto extends CreateContactDto {}

export class CreateAccountDto {
  @IsString()
  name!: string;
}
