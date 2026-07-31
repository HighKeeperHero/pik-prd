// ============================================================
// FeedbackService — closed-alpha reports (2026-07-31)
//
// 200 testers, one shot to learn from them. The rules that matter:
//   - Never lose a report. Submission is unauthenticated (a broken
//     session is the very thing worth reporting) and every failure
//     mode still stores the message.
//   - Always capture the build. A bug without app version / runtime
//     / channel / device is a bug you cannot chase.
//   - rootId is best-effort: recorded when the client knows it,
//     null when it does not, and SET NULL if the hero is deleted.
// ============================================================

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

export const FEEDBACK_KINDS = ['bug', 'idea', 'praise', 'other'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];

const MAX_MESSAGE = 4000;
const MAX_CONTEXT_KEYS = 40;

export interface SubmitFeedbackDto {
  root_id?: string;
  kind?: string;
  message?: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async submit(dto: SubmitFeedbackDto) {
    const message = (dto.message ?? '').trim();
    if (!message) throw new BadRequestException('The report cannot be empty.');
    if (message.length > MAX_MESSAGE) {
      throw new BadRequestException(`Keep it under ${MAX_MESSAGE} characters.`);
    }

    const kind = (FEEDBACK_KINDS as readonly string[]).includes(dto.kind ?? '')
      ? (dto.kind as FeedbackKind)
      : 'other';

    // Trust the client's context only as far as shape: cap the key
    // count and stringify values so a malformed payload can't bloat
    // the row or smuggle nested objects into the column.
    const context: Record<string, string> = {};
    for (const [k, v] of Object.entries(dto.context ?? {}).slice(0, MAX_CONTEXT_KEYS)) {
      if (v === null || v === undefined) continue;
      context[k.slice(0, 48)] = String(v).slice(0, 240);
    }

    // A root_id that no longer exists must not reject the report —
    // store it unattributed rather than lose the tester's words.
    let rootId: string | null = dto.root_id ?? null;
    if (rootId) {
      const hero = await this.prisma.rootIdentity
        .findUnique({ where: { id: rootId }, select: { id: true } })
        .catch(() => null);
      if (!hero) rootId = null;
    }

    const row = await this.prisma.feedback.create({
      data: { rootId, kind, message, context },
    });

    // Non-critical: the report is already safely stored.
    if (rootId) {
      await this.events.log({
        rootId,
        sourceId: 'codex-platform',
        eventType: 'feedback.submitted',
        payload: { feedback_id: row.id, kind },
      }).catch(() => {});
    }

    this.logger.log(`Feedback [${kind}] ${row.id}${rootId ? ` from ${rootId}` : ' (unattributed)'}`);

    return {
      received: true,
      feedback_id: row.id,
      kind,
    };
  }

  // ── TRIAGE (platform admin) ───────────────────────────────

  async list(params: { status?: string; kind?: string; limit?: number }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.kind)   where.kind   = params.kind;

    const rows = await this.prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 100, 500),
      include: { root: { select: { heroName: true, fateLevel: true } } },
    });

    return {
      count: rows.length,
      entries: rows.map(r => ({
        feedback_id: r.id,
        kind:        r.kind,
        status:      r.status,
        message:     r.message,
        context:     r.context,
        hero_name:   r.root?.heroName ?? null,
        fate_level:  r.root?.fateLevel ?? null,
        created_at:  r.createdAt.toISOString(),
      })),
    };
  }

  async setStatus(id: string, status: string) {
    if (!['new', 'triaged', 'closed'].includes(status)) {
      throw new BadRequestException('status must be new | triaged | closed');
    }
    const row = await this.prisma.feedback.update({ where: { id }, data: { status } });
    return { feedback_id: row.id, status: row.status };
  }
}
