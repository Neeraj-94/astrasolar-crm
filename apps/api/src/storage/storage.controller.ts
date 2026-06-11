import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PERMISSIONS } from '@astra/shared';
import { StorageService } from './storage.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';

class CreateUploadDto {
  @IsString() entity!: string;
  @IsString() entityId!: string;
  @IsString() fileName!: string;
  @IsOptional() @IsString() contentType?: string;
}

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('upload-url')
  createUploadUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUploadDto,
  ) {
    return this.storage.createUploadUrl({ ...dto, userId });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('documents')
  list(@Query('entity') entity: string, @Query('entityId') entityId: string) {
    return this.storage.listFor(entity, entityId);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('documents/:id/download-url')
  download(@Param('id') id: string) {
    return this.storage.downloadUrl(id);
  }
}
