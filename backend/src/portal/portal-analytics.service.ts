// ============================================================
// HEP Phase 2 Slice 2 — venue analytics
//
// The Partner Portal's dashboard, computed from Slice 1 run data.
// Scoped to one venue; a partner never sees another's numbers.
//
// Covers the Product 1 dashboard fields from the Phase 2 brief, plus
// walk-in conversion — which the brief does not ask for and a partner's
// finance team will ask for first, because it is the clearest evidence
// that Heroes drove new players rather than just entertaining existing
// ones.
//
// Place at: src/portal/portal-analytics.service.ts
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { ResolvedStaff } from './venue-staff.guard';

/** Default reporting window. */
const DEFAULT_DAYS = 30;

@Injectable()
export class PortalAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(staff: ResolvedStaff, days = DEFAULT_DAYS) {
    const sourceId = staff.sourceId;
    const since = new Date(Date.now() - clampDays(days) * 86400_000);

    const runs = await this.prisma.experienceRun.findMany({
      where: { sourceId, startedAt: { gte: since } },
      include: { participants: true, experience: { select: { slug: true } } },
    });

    const completed = runs.filter((r) => r.status === 'completed');
    const failed = runs.filter((r) => r.status === 'failed');
    const abandoned = runs.filter((r) => r.status === 'abandoned');
    const settled = completed.length + failed.length + abandoned.length;

    // ── Visitors ────────────────────────────────────────────────
    const seats = runs.flatMap((r) => r.participants);
    const identified = seats.filter((s) => s.rootId);
    const heroIds = new Set(identified.map((s) => s.rootId as string));

    // A repeat visitor is a hero seen in more than one COMPLETED run —
    // two seats in one run would otherwise read as a return visit.
    const completedRunIdsByHero = new Map<string, Set<string>>();
    for (const r of completed) {
      for (const s of r.participants) {
        if (!s.rootId) continue;
        const set = completedRunIdsByHero.get(s.rootId) ?? new Set();
        set.add(r.id);
        completedRunIdsByHero.set(s.rootId, set);
      }
    }
    const repeatVisitors = [...completedRunIdsByHero.values()].filter(
      (s) => s.size > 1,
    ).length;

    // ── Rewards paid ────────────────────────────────────────────
    let xpGranted = 0;
    let cachesGranted = 0;
    let titlesGranted = 0;
    for (const s of seats) {
      const r = (s.rewards ?? {}) as Record<string, any>;
      // Applied seats store the AppliedReward shape; pending guest seats
      // store the resolved-but-unpaid bundle. Only count what was paid.
      if (s.rewardState !== 'applied') continue;
      xpGranted += Number(r.xp_granted ?? 0);
      cachesGranted += (r.caches_granted?.length ?? 0);
      titlesGranted += (r.titles_granted?.length ?? 0);
    }

    // ── Walk-in conversion ──────────────────────────────────────
    // Counted from claims rather than from seats: a guest seat whose claim
    // was later redeemed has had a rootId written onto it, so counting
    // null-rootId seats would undercount exactly the conversions we care about.
    const claims = await this.prisma.guestClaim.findMany({
      where: { sourceId, createdAt: { gte: since } },
      select: { status: true },
    });
    const claimsIssued = claims.length;
    const claimsRedeemed = claims.filter((c) => c.status === 'claimed').length;

    // ── Cross-venue continuation ────────────────────────────────
    // Heroes who played here AND at another venue — the platform thesis
    // made measurable: their story continued somewhere else.
    let crossVenue = 0;
    if (heroIds.size > 0) {
      const elsewhere = await this.prisma.runParticipant.findMany({
        where: {
          rootId: { in: [...heroIds] },
          run: { sourceId: { not: sourceId } },
        },
        select: { rootId: true },
        distinct: ['rootId'],
      });
      crossVenue = elsewhere.length;
    }

    const durations = completed
      .map((r) => r.durationSec)
      .filter((d): d is number => typeof d === 'number' && d > 0);

    return {
      window: { days: clampDays(days), since: since.toISOString() },

      runs: {
        total: runs.length,
        active: runs.filter((r) => r.status === 'active').length,
        completed: completed.length,
        failed: failed.length,
        abandoned: abandoned.length,
        // Of runs that actually ended. Counting in-progress runs as
        // incomplete would make the rate drift with time of day.
        completion_rate: settled > 0 ? round(completed.length / settled, 3) : null,
      },

      session_duration_sec: {
        average: durations.length ? Math.round(avg(durations)) : null,
        median: durations.length ? Math.round(median(durations)) : null,
      },

      visitors: {
        total_seats: seats.length,
        identified: identified.length,
        guests: seats.length - identified.length,
        unique_heroes: heroIds.size,
        repeat_visitors: repeatVisitors,
      },

      rewards: {
        xp_granted: xpGranted,
        caches_granted: cachesGranted,
        titles_granted: titlesGranted,
      },

      /** Guests who left with a claim, and how many became players. */
      walk_in_conversion: {
        claims_issued: claimsIssued,
        claims_redeemed: claimsRedeemed,
        rate: claimsIssued > 0 ? round(claimsRedeemed / claimsIssued, 3) : null,
      },

      /** The platform thesis, measurable: stories that continued elsewhere. */
      cross_venue_continuation: crossVenue,

      technical_failures: {
        // A stated failure reason means the venue reported a problem;
        // abandonment usually means a party walked out mid-run. They are
        // operationally different and should not be summed.
        reported: failed.filter((r) => Boolean(r.failureReason)).length,
        abandoned: abandoned.length,
      },

      by_experience: summariseByExperience(runs),
    };
  }
}

function summariseByExperience(
  runs: { experience: { slug: string }; status: string }[],
) {
  const map = new Map<string, { total: number; completed: number }>();
  for (const r of runs) {
    const row = map.get(r.experience.slug) ?? { total: 0, completed: 0 };
    row.total++;
    if (r.status === 'completed') row.completed++;
    map.set(r.experience.slug, row);
  }
  return [...map.entries()].map(([slug, v]) => ({ slug, ...v }));
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_DAYS;
  return Math.min(Math.floor(days), 365);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round = (n: number, dp: number) => Number(n.toFixed(dp));
