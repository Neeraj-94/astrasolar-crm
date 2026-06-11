import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { BloomeLeadsService } from './bloome.service';
import { BloomeLeadsController } from './bloome.controller';
import { BloomeSyncService } from './bloome-sync.service';

@Module({
  providers: [LeadsService, BloomeLeadsService, BloomeSyncService],
  // BloomeLeadsController first: its static `leads/bloome` paths must be
  // registered ahead of LeadsController's parameterised `leads/:id`.
  controllers: [BloomeLeadsController, LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
