import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { LeadsModule } from '../leads/leads.module';
import { SalesModule } from '../sales/sales.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { NovaController } from './nova.controller';
import { NovaService } from './nova.service';
import { NovaAnthropicService } from './nova-anthropic.service';
import { NovaToolsService } from './nova-tools.service';
import { NovaKnowledgeService } from './nova-knowledge.service';
import { NovaVoiceService } from './nova-voice.service';
import { NovaSettingsService } from './nova-settings.service';
import { NovaRecommendationService } from './nova-recommendation.service';
import { NovaBriefingService } from './nova-briefing.service';

/**
 * Nova — the Claude-powered AI assistant. Pulls in the domain modules whose
 * services back her tools (products, leads, sales, analytics). PrismaService,
 * ScopeService and the auth guards are global, so they need no import here.
 *
 * NovaRecommendationService is exported so the checklist module can ask Nova to
 * turn a lead checklist into 5 quote-ready system packages.
 */
@Module({
  imports: [ProductsModule, LeadsModule, SalesModule, AnalyticsModule],
  controllers: [NovaController],
  providers: [
    NovaService,
    NovaAnthropicService,
    NovaToolsService,
    NovaKnowledgeService,
    NovaVoiceService,
    NovaSettingsService,
    NovaRecommendationService,
    NovaBriefingService,
  ],
  exports: [NovaKnowledgeService, NovaRecommendationService],
})
export class NovaModule {}
