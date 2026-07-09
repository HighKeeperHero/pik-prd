// ============================================================
// PIK — Feature Flags (2026-07-09, alpha release pipeline)
//
// Runtime feature control per release channel, so Tim decides
// what testers see without republishing bundles. Public read
// endpoint; writes happen via scripts/flags.ts against the DB.
// ============================================================
import { Module } from '@nestjs/common';
import { FlagsController } from './flags.controller';
import { FlagsService } from './flags.service';

@Module({
  controllers: [FlagsController],
  providers:   [FlagsService],
})
export class FlagsModule {}
