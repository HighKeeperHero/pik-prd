// ============================================================
// PIK — Demo Service (Sprint 6 — Track A)
//
// Creates cinematic demo sequences for investor presentations.
// Generates a narrative character, enrolls them, then simulates
// a series of gameplay sessions with timed delays so the
// investor can watch events flow through the operator console.
//
// Place at: src/demo/demo.service.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { SseService } from '../sse/sse.service';
import { LootService } from '../loot/loot.service';

// ── Narrative Character Data ──────────────────────────────

const HERO_NAMES = [
  'Kael Duskwalker', 'Lyra Ashveil', 'Thorne Ironbound',
  'Mira Starforge', 'Ash Blackthorn', 'Sable Voidkeeper',
  'Draven Flameheart', 'Elowen Nightshade', 'Orion Dawnblade',
  'Rune Stormcaller', 'Vex Shadowmend', 'Isolde Frostweaver',
  'Cael Embertide', 'Nyx Ravenclaw', 'Zara Moonshard',
];

const ALIGNMENTS = ['Order', 'Chaos', 'Wild', 'Veil'];

const ORIGINS = [
  'Forged in the Crucible of Shattered Stars',
  'Born beneath the Bleeding Moon of Khar\'Duum',
  'Awakened from the Dreaming Vault of Aethon',
  'Emerged from the Whispering Wastes of Solara',
  'Descended from the Sky Citadels of the Eternal Storm',
  'Risen from the Bone Gardens of Old Verath',
  'Called by the Singing Stones of the Deep Road',
  'Tempered in the Forge of the Last Flame',
];

const FATE_MARKERS = [
  'Heard the First Whisper of the Veil',
  'Drew blood from a Shade Captain',
  'Recovered the Fragment of Aethon\'s Key',
  'Survived the Trial of Hollow Mirrors',
  'Formed a blood pact with a Fatebound Guardian',
  'Witnessed the Opening of the Third Gate',
  'Carried the Dying Flame through the Ashen Corridor',
  'Spoke the Forbidden Name at the Crossroads',
  'Shattered the Binding Stone of Kel\'Thuzad',
  'Earned the grudging respect of the Iron Court',
  'Discovered the hidden passage beneath the Obsidian Spire',
  'Unlocked the memory of a fallen hero within the Dreamweave',
];

const SESSION_SCRIPTS: Array<{
  difficulty: 'normal' | 'hard';
  nodes: number;
  boss_pct: number;
  marker?: string;
  narration: string;
}> = [
  {
    difficulty: 'normal',
    nodes: 3,
    boss_pct: 25,
    narration: 'First expedition into the Veil — cautious, methodical.',
  },
  {
    difficulty: 'normal',
    nodes: 5,
    boss_pct: 45,
    marker: 'Discovered the hidden passage beneath the Obsidian Spire',
    narration: 'Growing confident. Cleared the Obsidian Spire approach.',
  },
  {
    difficulty: 'hard',
    nodes: 6,
    boss_pct: 72,
    marker: 'Drew blood from a Shade Captain',
    narration: 'Hard mode engaged. The Shade Captain falls.',
  },
  {
    difficulty: 'hard',
    nodes: 8,
    boss_pct: 95,
    marker: 'Witnessed the Opening of the Third Gate',
    narration: 'The Third Gate opens. Near-perfect boss execution.',
  },
  {
    difficulty: 'hard',
    nodes: 9,
    boss_pct: 100,
    marker: 'Shattered the Binding Stone of Kel\'Thuzad',
    narration: 'PERFECT RUN. The Binding Stone shatters. Legend forged.',
  },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sse: SseService,
    private readonly loot: LootService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a full cinematic demo sequence.
   *
   * Returns immediately with the demo identity info.
   * The simulation runs asynchronously, pushing events
   * through SSE as they happen.
   */
  async startDemo(options?: {
    hero_name?: string;
    fate_alignment?: string;
    origin?: string;
    session_count?: number;
    delay_ms?: number;
  }) {
    if (this.running) {
      return { status: 'already_running', message: 'A demo is already in progress.' };
    }

    this.running = true;
    const heroName = options?.hero_name || pick(HERO_NAMES);
    const alignment = options?.fate_alignment || pick(ALIGNMENTS);
    const origin = options?.origin || pick(ORIGINS);
    const sessionCount = Math.min(options?.session_count ?? 5, SESSION_SCRIPTS.length);
    const delayMs = options?.delay_ms ?? 2000;

    // Ensure the demo source exists
    const sourceId = 'src-heroes-veritas-01';
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      this.running = false;
      return {
        status: 'error',
        message: 'Demo source "src-heroes-veritas-01" not found. Run seed first.',
      };
    }

    // Phase 1: Broadcast demo start
    this.sse.emit('demo.started', {
      hero_name: heroName,
      fate_alignment: alignment,
      origin,
      session_count: sessionCount,
    });

    // Phase 2: Enroll the identity (synchronous — we need the root_id)
    const root = await this.prisma.$transaction(async (tx) => {
      const rootIdentity = await tx.rootIdentity.create({
        data: {
          heroName,
          fateAlignment: alignment,
          origin,
          enrolledBy: 'demo',
        },
      });

      await tx.persona.create({
        data: {
          rootId: rootIdentity.id,
          displayName: heroName,
        },
      });

      await tx.identityEvent.create({
        data: {
          rootId: rootIdentity.id,
          eventType: 'identity.enrolled',
          payload: {
            enrolled_by: 'demo',
            hero_name: heroName,
            fate_alignment: alignment,
            origin,
          },
        },
      });

      return rootIdentity;
    });

    // Broadcast enrollment
    this.sse.emit('identity.enrolled', {
      root_id: root.id,
      hero_name: heroName,
      fate_alignment: alignment,
      origin,
      enrolled_by: 'demo',
    });

    this.logger.log(`Demo started: ${heroName} (${root.id})`);

    // Phase 3: Run the simulation async (don't await)
    this.runSimulation(root.id, heroName, sourceId, sessionCount, delayMs)
      .catch((err) => {
        this.logger.error(`Demo simulation error: ${err.message}`);
        this.sse.emit('demo.error', { message: err.message });
      })
      .finally(() => {
        this.running = false;
      });

    return {
      status: 'started',
      root_id: root.id,
      hero_name: heroName,
      fate_alignment: alignment,
      origin,
      session_count: sessionCount,
    };
  }

  // ── Simulation Runner ────────────────────────────────────

  private async runSimulation(
    rootId: string,
    heroName: string,
    sourceId: string,
    sessionCount: number,
    delayMs: number,
  ) {
    await sleep(delayMs);

    // Grant source link
    const link = await this.prisma.sourceLink.create({
      data: {
        rootId,
        sourceId,
        grantedBy: 'demo',
      },
    });

    await this.events.log({
      rootId,
      eventType: 'source.link_granted',
      sourceId,
      payload: {
        link_id: link.id,
        source_id: sourceId,
        granted_by: 'demo',
      },
    });

    await sleep(delayMs);

    // Load progression config
    const configs = await this.prisma.config.findMany({
      where: {
        key: {
          in: [
            'fate.xp_base_threshold',
            'fate.xp_level_multiplier',
            'fate.xp_per_session_normal',
            'fate.xp_per_session_hard',
            'fate.xp_node_completion',
            'fate.xp_boss_tier_pct',
            'fate.event_xp_multiplier',
          ],
        },
      },
    });
    const map = new Map(configs.map((c) => [c.key, c.value]));
    const cfg = {
      xpBaseThreshold: parseFloat(map.get('fate.xp_base_threshold') ?? '200'),
      xpLevelMultiplier: parseFloat(map.get('fate.xp_level_multiplier') ?? '1.2'),
      xpPerSessionNormal: parseFloat(map.get('fate.xp_per_session_normal') ?? '100'),
      xpPerSessionHard: parseFloat(map.get('fate.xp_per_session_hard') ?? '150'),
      xpNodeCompletion: parseFloat(map.get('fate.xp_node_completion') ?? '15'),
      xpBossTierPct: parseFloat(map.get('fate.xp_boss_tier_pct') ?? '0.5'),
      eventXpMultiplier: parseFloat(map.get('fate.event_xp_multiplier') ?? '1.0'),
    };

    // Run sessions
    const scripts = SESSION_SCRIPTS.slice(0, sessionCount);

    for (let i = 0; i < scripts.length; i++) {
      const s = scripts[i];

      // Broadcast narration
      this.sse.emit('demo.narration', {
        session: i + 1,
        total: scripts.length,
        narration: s.narration,
        hero_name: heroName,
      });

      await sleep(delayMs * 0.6);

      // Calculate XP (mirrors IngestService exactly)
      const sessionXp = s.difficulty === 'hard' ? cfg.xpPerSessionHard : cfg.xpPerSessionNormal;
      const bossBonus = Math.floor((s.boss_pct / 100) * cfg.xpBossTierPct * sessionXp);
      const nodeXp = Math.floor(s.nodes * cfg.xpNodeCompletion);
      const totalXp = Math.floor((sessionXp + bossBonus + nodeXp) * cfg.eventXpMultiplier);

      // Get current user state
      const user = await this.prisma.rootIdentity.findUnique({
        where: { id: rootId },
        select: { fateXp: true, fateLevel: true },
      });

      if (!user) break;

      let newXp = user.fateXp + totalXp;
      let newLevel = user.fateLevel;
      const titlesGranted: string[] = [];

      // Check level-ups
      let threshold = Math.floor(
        cfg.xpBaseThreshold * Math.pow(cfg.xpLevelMultiplier, newLevel - 1),
      );
      while (newXp >= threshold) {
        newLevel++;
        const levelTitles: Record<number, string> = {
          2: 'title_fate_awakened',
          5: 'title_fate_burning',
          10: 'title_fate_ascendant',
        };
        if (levelTitles[newLevel]) {
          try {
            await this.prisma.userTitle.create({
              data: { rootId, titleId: levelTitles[newLevel], sourceId },
            });
            titlesGranted.push(levelTitles[newLevel]);
          } catch { /* already held */ }
        }
        threshold = Math.floor(
          cfg.xpBaseThreshold * Math.pow(cfg.xpLevelMultiplier, newLevel - 1),
        );
      }

      // Boss titles
      const bossTitles = [
        { threshold: 100, titleId: 'title_veilbreaker_100' },
        { threshold: 75, titleId: 'title_veilbreaker_75' },
        { threshold: 50, titleId: 'title_veilbreaker_50' },
      ];
      for (const bt of bossTitles) {
        if (s.boss_pct >= bt.threshold) {
          try {
            await this.prisma.userTitle.create({
              data: { rootId, titleId: bt.titleId, sourceId },
            });
            titlesGranted.push(bt.titleId);
          } catch { /* already held */ }
          break;
        }
      }

      // Update user
      await this.prisma.rootIdentity.update({
        where: { id: rootId },
        data: { fateXp: newXp, fateLevel: newLevel },
      });

      // Build changes
      const changes: Record<string, unknown> = {
        session_xp: sessionXp,
        boss_bonus_xp: bossBonus,
        node_xp: nodeXp,
        total_xp: totalXp,
        new_xp_total: newXp,
        new_level: newLevel,
      };
      if (newLevel > user.fateLevel) {
        changes.level_up = { from: user.fateLevel, to: newLevel };
      }
      if (titlesGranted.length > 0) {
        changes.titles_granted = titlesGranted;
      }

      // Log the session event (this also broadcasts via SSE)
      await this.events.log({
        rootId,
        eventType: 'progression.session_completed',
        sourceId,
        payload: {
          difficulty: s.difficulty,
          nodes_completed: s.nodes,
          boss_damage_pct: s.boss_pct,
          session_number: i + 1,
        },
        changes,
      });

      // If there's a fate marker for this session
      if (s.marker) {
        await sleep(delayMs * 0.4);

        await this.prisma.fateMarker.create({
          data: { rootId, marker: s.marker, sourceId },
        });

        await this.events.log({
          rootId,
          eventType: 'progression.fate_marker',
          sourceId,
          payload: { marker: s.marker },
          changes: { marker: s.marker },
        });
      }

      // Title events
      for (const titleId of titlesGranted) {
        await sleep(delayMs * 0.3);

        const title = await this.prisma.title.findUnique({
          where: { id: titleId },
          select: { displayName: true },
        });

        await this.events.log({
          rootId,
          eventType: 'progression.title_granted',
          sourceId,
          payload: { title_id: titleId },
          changes: {
            title_id: titleId,
            title_name: title?.displayName ?? titleId,
          },
        });
      }

      // Fate Cache drops
      if (newLevel > user.fateLevel) {
        await sleep(delayMs * 0.4);
        try {
          await this.loot.grantCache({
            rootId,
            cacheType: 'level_up',
            sourceId,
            trigger: `level_up:${newLevel}`,
            level: newLevel,
          });
        } catch { /* non-fatal */ }
      }

      if (s.boss_pct >= 50) {
        await sleep(delayMs * 0.3);
        const isLastSession = i === scripts.length - 1;
        try {
          await this.loot.grantCache({
            rootId,
            cacheType: 'boss_kill',
            sourceId,
            trigger: `boss_kill:${s.boss_pct}`,
            level: newLevel,
            // Force legendary on the final perfect run for demo impact
            rarityOverride: isLastSession && s.boss_pct === 100 ? 'legendary' : undefined,
          });
        } catch { /* non-fatal */ }
      }

      await sleep(delayMs);
    }

    // Demo complete
    const finalUser = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: {
        titles: { include: { title: true } },
        fateMarkers: true,
        inventory: { include: { item: true } },
        fateCaches: true,
      },
    });

    this.sse.emit('demo.completed', {
      root_id: rootId,
      hero_name: heroName,
      fate_xp: finalUser?.fateXp ?? 0,
      fate_level: finalUser?.fateLevel ?? 1,
      titles: finalUser?.titles.map((t) => t.title.displayName) ?? [],
      fate_markers: finalUser?.fateMarkers.map((m) => m.marker) ?? [],
      gear_count: finalUser?.inventory.length ?? 0,
      caches_sealed: finalUser?.fateCaches.filter((c) => c.status === 'sealed').length ?? 0,
    });

    this.logger.log(`Demo completed: ${heroName} → Level ${finalUser?.fateLevel}, ${finalUser?.fateXp} XP`);
  }
}
