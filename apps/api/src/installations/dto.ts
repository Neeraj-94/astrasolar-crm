import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { InstallationStatus } from '@astra/shared';

export class AssignInstallerDto {
  @IsString()
  installerId!: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateInstallationDto {
  @IsOptional() @IsEnum(InstallationStatus) status?: InstallationStatus;
  @IsOptional() @IsDateString() installDate?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() postInstallNotes?: string;
}
