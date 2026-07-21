// ============================================================
// PIK — Config Module (Sprint 5 — Source Admin)
//
// Now includes SourceAdminService for source lifecycle management.
//
// Place at: src/config/config.module.ts
// ============================================================
import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { SourceAdminService } from './source-admin.service';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PortalModule } from '../portal/portal.module';
import { PartnerModule } from '../partner/partner.module';

@Module({
  imports: [PortalModule, PartnerModule],
  controllers: [ConfigController],
  providers: [ConfigService, SourceAdminService, PlatformAdminGuard],
  exports: [ConfigService, SourceAdminService],
})
export class ConfigModule {}
