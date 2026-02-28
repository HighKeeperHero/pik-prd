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
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { ConsentService } from '../consent/consent.service';
import { IdentityService } from '../identity/identity.service';
import { IngestEventDto } from './dto/ingest-event.dto';
import { ResolvedSource } from '../auth/guards/api-key.guard';
import { LootService } from '../loot/loot.service';

/** Titles automatically granted at specific Fate Levels */
const LEVEL_TITLES: Record<number, string> = {
  2: 'title_fate_awakened',
  5: 'title_fate_burning',
  10: 'title_fate_ascendant',
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

    // 3. Dispatch to the appropriate handler
    switch (dto.event_type) {
      case 'progression.session_completed':
        return this.handleSessionCompleted(dto, source, user);

      case 'progression.xp_granted':
        return this.handleXpGranted(dto, source, user);

      case 'progression.node_completed':
        return this.handleNodeCompleted(dto, source, user);

      case 'progression.title_granted':
        return this.handleTitleGranted(dto, source, user);

      case 'progression.fate_marker':
        return this.handleFateMarker(dto, source, user);

      default:
        throw new BadRequestException(
          `Unknown event type: ${dto.event_type}`,
        );
    }
  }

  // ────────────────────────────────────────────────────────────
  // SESSION COMPLETED
  // ────────────────────────────────────────────────────────────

  private async handleSessionCompleted(
    dto: IngestEventDto,
    source: ResolvedSource,
    user: { id: string; fateXp: number; fateLevel: number },
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
      config,
    );

    // Check for boss damage titles
    const titlesGranted: string[] = [...(changes.titlesGranted ?? [])];
    for (const bt of BOSS_TITLES) {
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
      config,
    );

    const changesApplied: Record<string, unknown> = {
      xp_granted: totalXp,
    };
    if (changes.levelUp) {
      changesApplied.level_up = changes.levelUp;
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
      config,
    );

    const changesApplied: Record<string, unknown> = {
      node_xp: nodeXp,
    };
    if (changes.levelUp) {
      changesApplied.level_up = changes.levelUp;
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
   * Returns what changed (new totals, level-up info, titles granted).
   */
  private async applyXp(
    rootId: string,
    currentXp: number,
    currentLevel: number,
    xpToAdd: number,
    config: Awaited<ReturnType<IdentityService['getProgressionConfig']>>,
  ): Promise<{
    newXp: number;
    newLevel: number;
    levelUp: { from: number; to: number } | null;
    titlesGranted: string[];
  }> {
    let newXp = currentXp + xpToAdd;
    let newLevel = currentLevel;
    const titlesGranted: string[] = [];

    // Check for level-ups (can cascade through multiple levels)
    let threshold = Math.floor(
      config.xpBaseThreshold *
        Math.pow(config.xpLevelMultiplier, newLevel - 1),
    );

    while (newXp >= threshold) {
      newLevel++;

      // Grant level-based title if one exists for this level
      const levelTitle = LEVEL_TITLES[newLevel];
      if (levelTitle) {
        const granted = await this.tryGrantTitle(rootId, levelTitle, null);
        if (granted) titlesGranted.push(levelTitle);
      }

      // Recalculate threshold for next level
      threshold = Math.floor(
        config.xpBaseThreshold *
          Math.pow(config.xpLevelMultiplier, newLevel - 1),
      );
    }

    // Persist the updated XP and level
    await this.prisma.rootIdentity.update({
      where: { id: rootId },
      data: {
        fateXp: newXp,
        fateLevel: newLevel,
      },
    });

    return {
      newXp,
      newLevel,
      levelUp:
        newLevel > currentLevel
          ? { from: currentLevel, to: newLevel }
          : null,
      titlesGranted,
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
