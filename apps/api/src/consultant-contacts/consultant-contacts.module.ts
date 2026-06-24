import { Module } from '@nestjs/common';
import { ConsultantContactsService } from './consultant-contacts.service';
import { ConsultantContactsController } from './consultant-contacts.controller';

@Module({
  providers: [ConsultantContactsService],
  controllers: [ConsultantContactsController],
  exports: [ConsultantContactsService],
})
export class ConsultantContactsModule {}
