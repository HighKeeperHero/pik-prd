// ============================================================
// HEP — scannable links module
//
// Unauthenticated by necessity: the whole point is that a stranger with
// a phone camera, who may not have the app, can act on a printed sign.
//
// Place at: src/links/links.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { WellKnownController } from './well-known.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LinksController, WellKnownController],
  providers: [PrismaService],
})
export class LinksModule {}
