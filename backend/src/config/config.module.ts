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

@Module({
  controllers: [ConfigController],
  providers: [ConfigService, SourceAdminService],
  exports: [ConfigService, SourceAdminService],
})
export class ConfigModule {}
