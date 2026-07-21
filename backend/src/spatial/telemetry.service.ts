// ============================================================
// HEP Phase 2 Slice 6 — spatial telemetry
//
// Ingestion of client-reported measurements, and the rollup that turns
// them into a pass/fail against the Workstream 9 targets.
//
// Place at: src/spatial/telemetry.service.ts
// ============================================================

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { ResolvedStaff } from '../portal/venue-staff.guard';
import {
  THRESHOLDS,
  THRESHOLD_BY_METRIC,
  judge,
  percentile,
  mean,
} from './metrics';

/** One request may not carry more than this. */
const MAX_BATCH = 500;

/**
 * Reject measurements claiming to be from the future, or from before the
 * platform existed. A client with a wrong clock is common, and a metric
 * stamped 2049 would sit at the top of every "recent" window forever.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const EPOCH_FLOOR = new Date('2026-01-01T00:00:00Z').getTime();

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a batch of measurements.
   *
   * Partial acceptance: valid rows are stored and invalid ones reported.
   * An all-or-nothing batch would mean one malformed sample silently
   * costs a whole session of telemetry, and the client — mid-session, in
   * a room, with a guest waiting — is in no position to retry.
   */
  async record(
    sourceId: string,
    body: { run_id?: string; room_config_id?: string; metrics?: any[] },
  ) {
    const batch = body?.metrics;
    if (!Array.isArray(batch) || batch.length === 0) {
      throw new BadRequestException('Requires: metrics (non-empty array)');
    }
    if (batch.length > MAX_BATCH) {
      throw new BadRequestException(
        `Batch too large: ${batch.length} (max ${MAX_BATCH})`,
      );
    }

    // Tenant check up front: a run id from another venue must not be
    // writable, and must not be distinguishable from one that does not
    // exist.
    if (body.run_id) {
      const run = await this.prisma.experienceRun.findUnique({
        where: { id: body.run_id },
        select: { sourceId: true },
      });
      if (!run || run.sourceId !== sourceId) {
        throw new BadRequestException(`Unknown run: ${body.run_id}`);
      }
    }
    if (body.room_config_id) {
      const cfg = await this.prisma.roomConfig.findUnique({
        where: { id: body.room_config_id },
        include: { room: { select: { sourceId: true } } },
      });
      if (!cfg || cfg.room.sourceId !== sourceId) {
        throw new BadRequestException(
          `Unknown room configuration: ${body.room_config_id}`,
        );
      }
    }

    const now = Date.now();
    const accepted: any[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];

    batch.forEach((m: any, i: number) => {
      if (!m || typeof m.metric !== 'string' || !m.metric.trim()) {
        return rejected.push({ index: i, reason: 'metric name is required' });
      }
      if (typeof m.value !== 'number' || !Number.isFinite(m.value)) {
        return rejected.push({ index: i, reason: 'value must be a finite number' });
      }
      if (typeof m.unit !== 'string' || !m.unit.trim()) {
        return rejected.push({ index: i, reason: 'unit is required' });
      }

      // A known metric reported in the wrong unit is worse than an
      // unknown one: it will be silently compared against a threshold
      // that means something else. Centimetres judged as metres would
      // pass every time.
      const spec = THRESHOLD_BY_METRIC.get(m.metric);
      if (spec && m.unit !== spec.unit) {
        return rejected.push({
          index: i,
          reason: `'${m.metric}' must be reported in '${spec.unit}', got '${m.unit}'`,
        });
      }

      const capturedAt = m.captured_at ? new Date(m.captured_at) : new Date();
      if (Number.isNaN(capturedAt.getTime())) {
        return rejected.push({ index: i, reason: 'captured_at is not a date' });
      }
      if (capturedAt.getTime() > now + MAX_CLOCK_SKEW_MS) {
        return rejected.push({ index: i, reason: 'captured_at is in the future' });
      }
      if (capturedAt.getTime() < EPOCH_FLOOR) {
        return rejected.push({ index: i, reason: 'captured_at predates the platform' });
      }

      accepted.push({
        sourceId,
        runId: body.run_id ?? null,
        roomConfigId: body.room_config_id ?? null,
        metric: m.metric.trim(),
        value: m.value,
        unit: m.unit.trim(),
        deviceProfile: m.device_profile ?? null,
        deviceId: m.device_id ?? null,
        context: (m.context ?? {}) as never,
        capturedAt,
      });
    });

    if (accepted.length > 0) {
      await this.prisma.spatialMetric.createMany({ data: accepted });
    }

    return {
      accepted: accepted.length,
      rejected: rejected.length,
      // Returned, not just counted — a client that cannot see WHY a
      // sample was dropped will keep sending it.
      issues: rejected,
    };
  }

  /**
   * The Workstream 9 table, evaluated.
   *
   * Reports p95 for lower-is-better metrics rather than a mean: an
   * average error of 3cm hides the one session in twenty that localized
   * 20cm out, and that session is the one that generates a complaint.
   */
  async summary(staff: ResolvedStaff, days = 30) {
    const since = new Date(Date.now() - Math.min(days, 365) * 86400_000);

    const rows = await this.prisma.spatialMetric.findMany({
      where: { sourceId: staff.sourceId, capturedAt: { gte: since } },
      select: { metric: true, value: true, unit: true, deviceProfile: true },
    });

    const targets = await this.resolveTargets();
    const byMetric = new Map<string, number[]>();
    for (const r of rows) {
      const list = byMetric.get(r.metric) ?? [];
      list.push(r.value);
      byMetric.set(r.metric, list);
    }

    // Reward sync is DERIVED from our own ledger, not reported by a
    // client — we are the authority on whether a reward landed, and
    // asking the party that might have failed to deliver it to grade
    // itself would be worthless. It is also the one Workstream 9
    // threshold that already governs a system carrying real players, so
    // it should not sit at no_data waiting for an XR client to exist.
    const rewardSync = await this.computeRewardSync(staff.sourceId, since);

    const evaluated = THRESHOLDS.map((spec) => {
      const values = byMetric.get(spec.metric) ?? [];
      const target = targets[spec.metric] ?? spec.target;

      // Derived metrics ignore anything a client reported: we compute
      // them from data we own.
      if (spec.metric === 'rewards.sync_success') {
        if (!rewardSync) {
          return {
            metric: spec.metric,
            label: spec.label,
            unit: spec.unit,
            target,
            samples: 0,
            observed: null,
            derived: true,
            status: 'no_data' as const,
          };
        }
        return {
          metric: spec.metric,
          label: spec.label,
          unit: spec.unit,
          target,
          samples: rewardSync.eligible,
          observed: round(rewardSync.ratio),
          statistic: 'derived',
          derived: true,
          detail: rewardSync.detail,
          status: judge(spec, rewardSync.ratio, target)
            ? ('pass' as const)
            : ('fail' as const),
        };
      }

      // No samples is NOT a pass. A threshold with no data behind it is
      // exactly the vacuous confidence this project keeps having to
      // unlearn — it reads as green while measuring nothing.
      if (values.length === 0) {
        return {
          metric: spec.metric,
          label: spec.label,
          unit: spec.unit,
          target,
          samples: 0,
          observed: null,
          status: 'no_data' as const,
        };
      }

      const observed =
        spec.direction === 'lower_is_better'
          ? percentile(values, 95)!
          : mean(values)!;

      return {
        metric: spec.metric,
        label: spec.label,
        unit: spec.unit,
        target,
        samples: values.length,
        observed: round(observed),
        statistic: spec.direction === 'lower_is_better' ? 'p95' : 'mean',
        status: judge(spec, observed, target) ? ('pass' as const) : ('fail' as const),
      };
    });

    // Metrics the client reports that we have no threshold for. Surfaced
    // rather than hidden: they are usually the partner telling us
    // something we did not think to ask for.
    const known = new Set(THRESHOLDS.map((t) => t.metric));
    const unrecognised = [...byMetric.keys()].filter((m) => !known.has(m)).sort();

    return {
      window_days: days,
      total_samples: rows.length,
      thresholds: evaluated,
      summary: {
        pass: evaluated.filter((e) => e.status === 'pass').length,
        fail: evaluated.filter((e) => e.status === 'fail').length,
        no_data: evaluated.filter((e) => e.status === 'no_data').length,
      },
      unmeasured_metrics: unrecognised,
    };
  }

  /**
   * Reward synchronization: of the rewards we OWED a known hero, how
   * many actually landed.
   *
   * The definition is the whole design here, so it is written out rather
   * than left implicit in a query:
   *
   *   eligible  = seats with a rootId whose rewardState is one of
   *               applied | pending | expired
   *   delivered = of those, rewardState = 'applied'
   *
   * A seat with a rootId had somewhere to put the reward. If it is still
   * `pending`, or reached `expired`, the reward was owed to an
   * identifiable hero and never arrived — that is a synchronization
   * failure and exactly what this threshold is for.
   *
   * Deliberately EXCLUDED, because counting them would make the number
   * lie in both directions:
   *
   * - `skipped` — the venue lacks the rewards scope, the payout computed
   *   to zero, or the daily ceiling was hit. Policy working as intended,
   *   not a delivery failure. Counting it would make a correctly
   *   configured rehearsal venue look catastrophically broken.
   * - `reversed` — a deliberate admin action. Counting a reversal as a
   *   failed delivery would punish us for having an undo.
   * - Guest seats never claimed (rootId null) — that is walk-in
   *   conversion, a different question with a different owner. Folding
   *   it in here would blame the sync layer for a guest who chose not to
   *   install the app.
   */
  private async computeRewardSync(sourceId: string, since: Date) {
    const seats = await this.prisma.runParticipant.groupBy({
      by: ['rewardState'],
      where: {
        rootId: { not: null },
        rewardState: { in: ['applied', 'pending', 'expired'] },
        run: { sourceId, startedAt: { gte: since } },
      },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const row of seats) counts[row.rewardState] = row._count._all;

    const delivered = counts['applied'] ?? 0;
    const eligible = Object.values(counts).reduce((a, b) => a + b, 0);

    // No eligible seats is no_data, NOT 100%. An empty numerator over an
    // empty denominator is not a perfect score, and reporting 1.0 here
    // would be the vacuous pass wearing a percentage sign.
    if (eligible === 0) return null;

    return {
      ratio: delivered / eligible,
      eligible,
      detail: {
        delivered,
        stuck_pending: counts['pending'] ?? 0,
        expired: counts['expired'] ?? 0,
      },
    };
  }

  /** Runtime overrides for the tunable targets. */
  private async resolveTargets(): Promise<Record<string, number>> {
    const keyed = THRESHOLDS.filter((t) => t.configKey);
    if (keyed.length === 0) return {};

    const rows = await this.prisma.config
      .findMany({ where: { key: { in: keyed.map((t) => t.configKey!) } } })
      .catch(() => [] as Array<{ key: string; value: string }>);

    const byKey = new Map<string, number>(
      rows.map((r) => [r.key, Number(r.value)] as [string, number]),
    );
    const out: Record<string, number> = {};
    for (const spec of keyed) {
      const v = byKey.get(spec.configKey!);
      if (v !== undefined && Number.isFinite(v)) out[spec.metric] = v;
    }
    return out;
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
