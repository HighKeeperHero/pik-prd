// ============================================================
// PIK — Relic Marks Module
// XR interop seam for Reliquary Mark USDZ assets.
// Place at: src/relic-marks/relic-marks.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { RelicMarksController } from './relic-marks.controller';

@Module({
  controllers: [RelicMarksController],
})
export class RelicMarksModule {}
