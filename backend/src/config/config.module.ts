// ============================================================
// PIK — Config Module
//
// Live-tunable config and source registry listing.
//
// Place at: src/config/config.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
