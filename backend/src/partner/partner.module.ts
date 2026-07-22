// ============================================================
// HEP Phase 2 Slice 1 — Partner module
//
// The venue-facing surface: experience runs, payouts, guest claims.
//
// Additive by construction — nothing here is imported by an existing
// Codex module, so the app cannot be affected by it.
//
// Place at: src/partner/partner.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { ClaimController } from './claim.controller';
import { VenueAccessController } from './venue-access.controller';
import { PartnerService } from './partner.service';
import { RewardService } from './reward.service';
import { ClaimService } from './claim.service';
import { VenueAccessService } from './venue-access.service';
import { VenueSweeperService } from './venue-sweeper.service';
import { ReversalService } from './reversal.service';
import { PrismaService } from '../prisma.service';
import { CertificationModule } from '../certification/certification.module';
import { EventsModule } from '../events/events.module';
import { LevelingModule } from '../leveling/leveling.module';
import { FateAccountModule } from '../fate-account/fate-account.module';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { AccountGuard } from '../auth/guards/account.guard';

@Module({
  // FateAccountModule exports FateAccountService — AccountGuard's dependency,
  // used by the claim redemption route. Omitting it crashes Nest bootstrap at
  // runtime while the build stays green (see fox.module.ts, 2026-07-09).
  imports: [EventsModule, LevelingModule, FateAccountModule, CertificationModule],
  controllers: [PartnerController, ClaimController, VenueAccessController],
  providers: [
    PartnerService,
    RewardService,
    ClaimService,
    VenueAccessService,
    VenueSweeperService,
    ReversalService,
    PrismaService,
    ApiKeyGuard,
    AccountGuard,
  ],
  exports: [RewardService, ReversalService],
})
export class PartnerModule {}
