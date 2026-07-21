// ============================================================
// PIK — Ingest Service
// Progression Event Processing Engine
//
// Ports the full XP calculation, title granting, level-up,
// and fate marker logic from the Python MVP (pik_api.py).
//
// Supported event types:
//   progression.session_completed  → XP from session + nodes + boss
//   progression.xp_granted         → Direct XP grant
//   progression.node_completed     → XP from a single node
//   progression.title_granted      → Grant a title by ID
//   progression.fate_marker        → Store a narrative breadcrumb
//
// Place at: src/ingest/ingest.service.ts
// ============================================================

import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { ConsentService } from '../consent/consent.service';
import { IdentityService } from '../identity/identity.service';
import { IngestEventDto } from './dto/ingest-event.dto';
import { ResolvedSource } from '../auth/guards/api-key.guard';
import { LootService } from '../loot/loot.service';
import { QuestService } from '../quest/quest.service';
import { MarkerEngineService } from '../marker-engine/marker-engine.service'; // ← ADDED
import { LevelingService } from '../leveling/leveling.service';
import { intersectScopes } from '../auth/scopes';

/** Titles automatically granted at specific Fate Levels */
const LEVEL_TITLES: Record<number, string> = {
  2: 'title_fate_awakened',
  5: 'title_fate_burning',
  10: 'title_fate_ascendant',
};

/**
 * Phase 2 Slice 0 — scope required to write each partner event type.
 * The vocabulary matches SourceLink.scope / Source.scopes.
 */
const EVENT_SCOPES: Record<string, string> = {
  'progression.session_completed': 'xp',
  'progression.xp_granted':        'xp',
  'progression.node_completed':    'xp',
  'progression.title_granted':     'titles',
  'progression.fate_marker':       'fate_markers',
};

/** Titles automatically granted at boss damage thresholds */
const BOSS_TITLES: { threshold: number; titleId: string }[] = [
  { threshold: 100, titleId: 'title_veilbreaker_100' },
  { threshold: 75, titleId: 'title_veilbreaker_75' },
  { threshold: 50, titleId: 'title_veilbreaker_50' },
];

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly consent: ConsentService,
    private readonly identity: IdentityService,
    private readonly loot: LootService,
    private readonly quests: QuestService,
    private readonly markerEngine: MarkerEngineService, // ← ADDED
    private readonly leveling: LevelingService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // INGEST — Main entry point
  // ────────────────────────────────────────────────────────────

  async ingest(dto: IngestEventDto, source: ResolvedSource) {
    // 1. Verify the user exists
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: dto.root_id },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${dto.root_id}`);
    }

    // 2. Verify active consent link between user and source
    const link = await this.consent.validateActiveLink(
      dto.root_id,
      source.id,
    );
    if (!link) {
      throw new ForbiddenException(
        'No active consent link for this user and source',
      );
    }

    // 3. Resolve the effective scope and authorize the event type.
    //    Effective = what the partner is allowed to do at all, intersected
    //    with what this specific player consented to. Stored since 2024 but
    //    never enforced until Phase 2 Slice 0.
    const granted = intersectScopes(source.scopes, link.scope);
    const required = EVENT_SCOPES[dto.event_type];
    if (!required) {
      throw new BadRequestException(`Unknown event type: ${dto.event_type}`);
    }
    if (!granted.has(required)) {
      throw new ForbiddenException(
        `Event ${dto.event_type} requires the '${required}' scope; ` +
          `this grant allows: ${[...granted].join(' ') || '(none)'}`,
      );
    }

    // 4. Reserve the idempotency key BEFORE applying any rewards, so a
    //    concurrent retry loses the race on the unique constraint rather
    //    than double-granting. Partners integrated before Slice 0 may omit
    //    event_id; those requests are not deduplicated.
    const reservation = dto.event_id
      ? await this.reserveReceipt(dto, source)
      : null;
    if (reservation?.replay) {
      return { ...reservation.replay, replayed: true };
    }

    try {
      // 5. Dispatch to the appropriate handler
      let result: any;
      switch (dto.event_type) {
        case 'progression.session_completed':
          result = await this.handleSessionCompleted(dto, source, user, granted);
          break;
        case 'progression.xp_granted':
          result = await this.handleXpGranted(dto, source, user);
          break;
        case 'progression.node_completed':
          result = await this.handleNodeCompleted(dto, source, user);
          break;
        case 'progression.title_granted':
          result = await this.handleTitleGranted(dto, source, user);
          break;
        case 'progression.fate_marker':
          result = await this.handleFateMarker(dto, source, user);
          break;
      }

      // 6. Auto-evaluate quest objectives
      try {
        const completedQuests = await this.quests.evaluateForPlayer(dto.root_id);
        if (completedQuests.length > 0) {
          result.quests_completed = completedQuests;
        }
      } catch (err) {
        this.logger.warn(`Quest evaluation failed for ${dto.root_id}: ${err.message}`);
      }

      if (!dto.event_id) {
        result.deduplicated = false;
      }

      // 7. Commit the receipt so retries replay this exact response.
      if (reservation) {
        await this.prisma.ingestReceipt.update({
          where: { id: reservation.receiptId },
          data:  { status: 'completed', response: result },
        });
      }

      return result;
    } catch (err) {
      // Release the reservation so the partner's retry can actually retry.
      // Without this a transient failure would permanently burn the key.
      if (reservation) {
        await this.prisma.ingestReceipt
          .delete({ where: { id: reservation.receiptId } })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * Claim `event_id` for this source. Returns the stored response when the
   * key was already used (a replay), otherwise the new receipt's id.
   */
  private async reserveReceipt(
    dto: IngestEventDto,
    source: ResolvedSource,
  ): Promise<{ receiptId: string; replay?: Record<string, unknown> }> {
    try {
      const receipt = await this.prisma.ingestReceipt.create({
        data: {
          sourceId:  source.id,
          eventKey:  dto.event_id!,
          rootId:    dto.root_id,
          eventType: dto.event_type,
        },
      });
      return { receiptId: receipt.id };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;

      const existing = await this.prisma.ingestReceipt.findUnique({
        where: {
          sourceId_eventKey: { sourceId: source.id, eventKey: dto.event_id! },
        },
      });

      // Lost the race to an in-flight original. Tell the caller to back off
      // rather than returning a half-formed response.
      if (!existing || existing.status !== 'completed') {
        throw new ConflictException(
          `Event ${dto.event_id} is currently being processed; retry shortly`,
        );
      }

      this.logger.log(
        `Replayed ingest ${dto.event_id} from ${source.name} — no rewards re-granted`,
      );
      return {
        receiptId: existing.id,
        replay: existing.response as Record<string, unknown>,
      };
    }
  }

  // ────────────────────────────────────────────────────────────
  // SESSION COMPLETED
  // ────────────────────────────────────────────────────────────

  private async handleSessionCompleted(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
    granted: Set<string>,
  ) {
    const { difficulty, nodes_completed, boss_damage_pct } =
      dto.payload as {
        difficulty: string;
        nodes_completed: number;
        boss_damage_pct: number;
      };

    // Validate required payload fields
    if (!difficulty || nodes_completed == null || boss_damage_pct == null) {
      throw new BadRequestException(
        'session_completed requires: difficulty, nodes_completed, boss_damage_pct',
      );
    }

    const config = await this.identity.getProgressionConfig();

    // Calculate XP components (matches Python MVP formulas exactly)
    const sessionXp =
      difficulty === 'hard'
        ? config.xpPerSessionHard
        : config.xpPerSessionNormal;

    const bossBonus = Math.floor(
      (boss_damage_pct / 100) * config.xpBossTierPct * sessionXp,
    );

    const nodeXp = Math.floor(nodes_completed * config.xpNodeCompletion);

    const totalXp = Math.floor(
      (sessionXp + bossBonus + nodeXp) * config.eventXpMultiplier,
    );

    // Apply XP and check for level-ups
    const changes = await this.applyXp(
      user.id,
      user.fateXp,
      user.fateLevel,
      totalXp,
    );

    // Check for boss damage titles. A session_completed event only needs the
    // 'xp' scope, so the incidental title awards are gated separately —
    // a venue licensed for XP alone must not mint titles as a side effect.
    const titlesGranted: string[] = [...(changes.titlesGranted ?? [])];
    for (const bt of BOSS_TITLES) {
      if (!granted.has('titles')) break;
      if (boss_damage_pct >= bt.threshold) {
        const granted = await this.tryGrantTitle(
          user.id,
          bt.titleId,
          source.id,
        );
        if (granted) titlesGranted.push(bt.titleId);
        break; // Only grant highest qualifying tier
      }
    }

    // Build the changes_applied object (matches MVP response shape)
    const changesApplied: Record<string, unknown> = {
      session_xp: sessionXp,
      boss_bonus_xp: bossBonus,
      node_xp: nodeXp,
      total_xp: totalXp,
    };

    if (changes.levelUp) {
      changesApplied.level_up = changes.levelUp;
    }

    if (changes.foxBonus > 0) {
      changesApplied.fox_bonus_xp = changes.foxBonus;
    }

    if (titlesGranted.length > 0) {
      changesApplied.title_granted = titlesGranted[0]; // MVP returns single title
    }

    // ── Fate Cache drops ────────────────────────────────────
    const cachesGranted: string[] = [];

    // Level-up cache
    if (changes.levelUp) {
      try {
        const cache = await this.loot.grantCache({
          rootId: user.id,
          cacheType: 'level_up',
          sourceId: source.id,
          trigger: `level_up:${changes.newLevel}`,
          level: changes.newLevel,
        });
        cachesGranted.push(cache.cache_id);
      } catch (err) {
        this.logger.warn(`Cache grant failed (level_up): ${err}`);
      }
    }

    // Boss kill cache (≥ 50% damage)
    if (boss_damage_pct >= 50) {
      try {
        const cache = await this.loot.grantCache({
          rootId: user.id,
          cacheType: 'boss_kill',
          sourceId: source.id,
          trigger: `boss_kill:${boss_damage_pct}`,
          level: changes.newLevel,
        });
        cachesGranted.push(cache.cache_id);
      } catch (err) {
        this.logger.warn(`Cache grant failed (boss_kill): ${err}`);
      }
    }

    if (cachesGranted.length > 0) {
      changesApplied.caches_granted = cachesGranted;
    }

    // Log the event
    const event = await this.events.log({
      rootId: user.id,
      eventType: dto.event_type,
      sourceId: source.id,
      payload: dto.payload,
      changes: changesApplied,
    });

    this.logger.log(
      `Session completed: ${user.id} +${totalXp} XP from ${source.name}` +
        (changes.levelUp
          ? ` ★ LEVEL UP ${changes.levelUp.from} → ${changes.levelUp.to}`
          : ''),
    );

    return {
      event_id: event.id,
      event_type: event.eventType,
      changes_applied: changesApplied,
    };
  }

  // ────────────────────────────────────────────────────────────
  // XP GRANTED (direct)
  // ────────────────────────────────────────────────────────────

  private async handleXpGranted(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
  ) {
    const { xp } = dto.payload as { xp: number };

    if (xp == null || typeof xp !== 'number') {
      throw new BadRequestException('xp_granted requires: xp (number)');
    }

    const config = await this.identity.getProgressionConfig();
    const totalXp = Math.floor(xp * config.eventXpMultiplier);

    const changes = await this.applyXp(
      user.id,
      user.fateXp,
      user.fateLevel,
      totalXp,
    );

    const changesApplied: Record<string, unknown> = {
      xp_granted: totalXp,
    };
    if (changes.levelUp) {
      changesApplied.level_up = changes.levelUp;
    }
    if (changes.foxBonus > 0) {
      changesApplied.fox_bonus_xp = changes.foxBonus;
    }

    const event = await this.events.log({
      rootId: user.id,
      eventType: dto.event_type,
      sourceId: source.id,
      payload: dto.payload,
      changes: changesApplied,
    });

    return {
      event_id: event.id,
      event_type: event.eventType,
      changes_applied: changesApplied,
    };
  }

  // ────────────────────────────────────────────────────────────
  // NODE COMPLETED
  // ────────────────────────────────────────────────────────────

  private async handleNodeCompleted(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
  ) {
    const { node_id } = dto.payload as { node_id: string };

    if (!node_id) {
      throw new BadRequestException(
        'node_completed requires: node_id (string)',
      );
    }

    const config = await this.identity.getProgressionConfig();
    const nodeXp = Math.floor(
      config.xpNodeCompletion * config.eventXpMultiplier,
    );

    const changes = await this.applyXp(
      user.id,
      user.fateXp,
      user.fateLevel,
      nodeXp,
    );

    const changesApplied: Record<string, unknown> = {
      node_xp: nodeXp,
    };
    if (changes.levelUp) {
      changesApplied.level_up = changes.levelUp;
    }
    if (changes.foxBonus > 0) {
      changesApplied.fox_bonus_xp = changes.foxBonus;
    }

    const event = await this.events.log({
      rootId: user.id,
      eventType: dto.event_type,
      sourceId: source.id,
      payload: dto.payload,
      changes: changesApplied,
    });

    return {
      event_id: event.id,
      event_type: event.eventType,
      changes_applied: changesApplied,
    };
  }

  // ────────────────────────────────────────────────────────────
  // TITLE GRANTED
  // ────────────────────────────────────────────────────────────

  private async handleTitleGranted(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
  ) {
    const { title_id } = dto.payload as { title_id: string };

    if (!title_id) {
      throw new BadRequestException(
        'title_granted requires: title_id (string)',
      );
    }

    // Verify title exists in reference table
    const title = await this.prisma.title.findUnique({
      where: { id: title_id },
    });
    if (!title) {
      throw new BadRequestException(`Unknown title: ${title_id}`);
    }

    const granted = await this.tryGrantTitle(user.id, title_id, source.id);

    const changesApplied: Record<string, unknown> = {
      title_id,
      title_name: title.displayName,
      already_held: !granted,
    };

    const event = await this.events.log({
      rootId: user.id,
      eventType: dto.event_type,
      sourceId: source.id,
      payload: dto.payload,
      changes: changesApplied,
    });

    return {
      event_id: event.id,
      event_type: event.eventType,
      changes_applied: changesApplied,
    };
  }

  // ────────────────────────────────────────────────────────────
  // FATE MARKER
  // ────────────────────────────────────────────────────────────

  private async handleFateMarker(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
  ) {
    const { marker } = dto.payload as { marker: string };

    if (!marker) {
      throw new BadRequestException(
        'fate_marker requires: marker (string)',
      );
    }

    // Fate markers are freeform — no validation against a reference table.
    await this.prisma.fateMarker.create({
      data: {
        rootId: user.id,
        marker,
        sourceId: source.id,
      },
    });

    // ← ADDED: check whether any milestone thresholds were crossed
    try {
      await this.markerEngine.checkMilestones(user.id, source.id);
    } catch (err) {
      this.logger.warn(`Marker engine failed for ${user.id}: ${err}`);
    }

    const changesApplied = { marker };

    const event = await this.events.log({
      rootId: user.id,
      eventType: dto.event_type,
      sourceId: source.id,
      payload: dto.payload,
      changes: changesApplied,
    });

    return {
      event_id: event.id,
      event_type: event.eventType,
      changes_applied: changesApplied,
    };
  }

  // ────────────────────────────────────────────────────────────
  // SHARED HELPERS
  // ────────────────────────────────────────────────────────────

  /**
   * Apply XP to a user and handle level-up cascading.
   *
   * Phase 2 Slice 0: this used to reimplement the XP curve inline, using
   * the old Python-MVP geometric thresholds (xpBaseThreshold ·
   * xpLevelMultiplier^(n-1)). That curve no longer matches canon, so
   * partner-granted XP leveled heroes on a different ladder than in-app
   * XP and ignored the L60 cap, the Fate Fox bonus, and the monotonic
   * level guard. It now delegates to LevelingService — the single source
   * of truth (see src/leveling/leveling.service.ts).
   */
  private async applyXp(
    rootId: string,
    currentXp: number,
    currentLevel: number,
    xpToAdd: number,
  ): Promise<{
    newXp: number;
    newLevel: number;
    levelUp: { from: number; to: number } | null;
    titlesGranted: string[];
    foxBonus: number;
  }> {
    const award = await this.leveling.grantXp(rootId, xpToAdd);

    // grantXp returns null when the hero is missing or already XP-capped.
    if (!award) {
      return {
        newXp: currentXp,
        newLevel: currentLevel,
        levelUp: null,
        titlesGranted: [],
        foxBonus: 0,
      };
    }

    // Award any level titles crossed by this grant. grantXp can cascade
    // several levels at once, so walk the range rather than checking only
    // the final level.
    const titlesGranted: string[] = [];
    for (let lvl = currentLevel + 1; lvl <= award.fate_level; lvl++) {
      const levelTitle = LEVEL_TITLES[lvl];
      if (!levelTitle) continue;
      const wasGranted = await this.tryGrantTitle(rootId, levelTitle, null);
      if (wasGranted) titlesGranted.push(levelTitle);
    }

    return {
      newXp: award.fate_xp,
      newLevel: award.fate_level,
      levelUp: award.leveled_up
        ? { from: currentLevel, to: award.fate_level }
        : null,
      titlesGranted,
      foxBonus: award.fox_bonus,
    };
  }

  /**
   * Grant a title if the user doesn't already hold it.
   * Returns true if newly granted, false if already held.
   */
  private async tryGrantTitle(
    rootId: string,
    titleId: string,
    sourceId: string | null,
  ): Promise<boolean> {
    try {
      await this.prisma.userTitle.create({
        data: {
          rootId,
          titleId,
          sourceId,
        },
      });
      return true;
    } catch (error: any) {
      // Unique constraint violation = user already has this title
      if (error?.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }
}

// intersectScopes moved to src/auth/scopes.ts in Slice 1 so the ingest path
// and the partner run API share one definition of effective permission.
