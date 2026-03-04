// ============================================================
// PIK — Identity Service
// Place at: src/identity/identity.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, SourceLink } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { EnrollUserDto } from './dto/enroll-user.dto';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  private readonly NEXUS_YIELD: Record<string, number> = {
    common: 5,
    uncommon: 15,
    rare: 40,
    epic: 100,
    legendary: 250,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ── ENROLL ────────────────────────────────────────────────

  async enroll(dto: EnrollUserDto) {
    if (dto.source_id) {
      const source = await this.prisma.source.findUnique({
        where: { id: dto.source_id },
      });
      if (!source || source.status !== 'active') {
        throw new BadRequestException(
          `Unknown or inactive source: ${dto.source_id}`,
        );
      }
    }

    // ── Hero name uniqueness check (case-insensitive) ──
    const existingName = await this.prisma.rootIdentity.findFirst({
      where: {
        heroName: { equals: dto.hero_name, mode: 'insensitive' },
        status: 'active',
      },
      select: { id: true, heroName: true },
    });
    if (existingName) {
      // Generate suggestions
      const suggestions = await this.suggestHeroNames(dto.hero_name);
      throw new ConflictException({
        message: `Hero name "${dto.hero_name}" is already taken`,
        taken_name: dto.hero_name,
        suggestions,
      });
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const root = await tx.rootIdentity.create({
          data: {
            heroName: dto.hero_name,
            fateAlignment: dto.fate_alignment,
            origin: dto.origin ?? null,
            enrolledBy: dto.enrolled_by,
          },
        });

        const persona = await tx.persona.create({
          data: {
            rootId: root.id,
            displayName: dto.hero_name,
          },
        });

        let link: SourceLink | null = null;
        if (dto.source_id) {
          link = await tx.sourceLink.create({
            data: {
              rootId: root.id,
              sourceId: dto.source_id,
              grantedBy: dto.enrolled_by,
            },
          });
        }

        await tx.identityEvent.create({
          data: {
            rootId: root.id,
            eventType: 'identity.enrolled',
            payload: {
              enrolled_by: dto.enrolled_by,
              hero_name: dto.hero_name,
              fate_alignment: dto.fate_alignment,
              origin: dto.origin ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        if (link) {
          await tx.identityEvent.create({
            data: {
              rootId: root.id,
              eventType: 'source.link_granted',
              sourceId: dto.source_id!,
              payload: {
                link_id: link.id,
                source_id: dto.source_id!,
                granted_by: dto.enrolled_by,
                scope: link.scope,
              } as Prisma.InputJsonValue,
            },
          });
        }

        return { root, persona, link };
      });

      this.logger.log(
        `Enrolled: ${dto.hero_name} (${result.root.id}) by ${dto.enrolled_by}`,
      );

      return {
        root_id: result.root.id,
        persona_id: result.persona.id,
        hero_name: result.root.heroName,
        fate_alignment: result.root.fateAlignment,
        ...(result.link ? { link_id: result.link.id } : {}),
        enrolled_at: result.root.enrolledAt.toISOString(),
      };
    } catch (err) {
      // Catch race condition: unique constraint violation at DB level
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const suggestions = await this.suggestHeroNames(dto.hero_name);
        throw new ConflictException({
          message: `Hero name "${dto.hero_name}" is already taken`,
          taken_name: dto.hero_name,
          suggestions,
        });
      }
      throw err;
    }
  }

  // ── LIST ──────────────────────────────────────────────────

  async listUsers() {
    const users = await this.prisma.rootIdentity.findMany({
      where: { status: 'active' },
      include: {
        sourceLinks: {
          where: { status: 'active' },
          select: { id: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    return users.map((u) => ({
      root_id: u.id,
      hero_name: u.heroName,
      fate_alignment: u.fateAlignment,
      fate_xp: u.fateXp,
      fate_level: u.fateLevel,
      active_sources: u.sourceLinks.length,
    }));
  }

  // ── GET USER (nested format for dashboard) ────────────────

  async getUser(rootId: string) {
    // Core query — never fails even if gear tables are missing
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: {
        personas: {
          select: { id: true, displayName: true, status: true, createdAt: true },
        },
        sourceLinks: {
          include: { source: { select: { name: true } } },
          orderBy: { grantedAt: 'desc' },
        },
        titles: {
          include: { title: { select: { displayName: true, category: true } } },
          orderBy: { grantedAt: 'desc' },
        },
        fateMarkers: { orderBy: { createdAt: 'desc' } },
        fateCaches: { orderBy: { grantedAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }

    // Gear data — separate query so profile works even if gear tables aren't migrated yet
    let inventoryData: any[] = [];
    let equipmentData: any[] = [];
    try {
      inventoryData = await this.prisma.playerInventory.findMany({
        where: { rootId },
        include: { item: true, equipment: true },
        orderBy: { acquiredAt: 'desc' },
      });
      equipmentData = await this.prisma.playerEquipment.findMany({
        where: { rootId },
        include: { inventory: { include: { item: true } } },
      });
    } catch (err) {
      // Gear tables may not exist yet — that's OK
      this.logger.warn(`Gear data unavailable for ${rootId}: ${err.message}`);
    }

    // Session data — separate query for resilience
    let sessionData: any[] = [];
    let activeSession: any = null;
    try {
      sessionData = await this.prisma.playerSession.findMany({
        where: { rootId },
        orderBy: { checkedInAt: 'desc' },
        take: 10,
      });
      activeSession = await this.prisma.playerSession.findFirst({
        where: { rootId, status: 'active' },
      });
    } catch (err) {
      this.logger.warn(`Session data unavailable for ${rootId}: ${err.message}`);
    }

    // Wearable tokens — separate query for resilience
    let wearableData: any[] = [];
    try {
      wearableData = await this.prisma.identityToken.findMany({
        where: { rootId },
        orderBy: { issuedAt: 'desc' },
      });
    } catch (err) {
      this.logger.warn(`Wearable data unavailable for ${rootId}: ${err.message}`);
    }

    // Quest data — separate query for resilience
    let questData: any[] = [];
    try {
      questData = await this.prisma.playerQuest.findMany({
        where: { rootId },
        include: { quest: true },
        orderBy: { startedAt: 'desc' },
      });
    } catch (err) {
      this.logger.warn(`Quest data unavailable for ${rootId}: ${err.message}`);
    }

    // Get progression config for XP calculations
    const config = await this.getProgressionConfig();
    const nextLevelThreshold = Math.floor(
      config.xpBaseThreshold *
        Math.pow(config.xpLevelMultiplier, user.fateLevel - 1),
    );

    // Calculate XP within current level
    let xpSpentOnPreviousLevels = 0;
    for (let i = 1; i < user.fateLevel; i++) {
      xpSpentOnPreviousLevels += Math.floor(
        config.xpBaseThreshold * Math.pow(config.xpLevelMultiplier, i - 1),
      );
    }
    const xpInCurrentLevel = user.fateXp - xpSpentOnPreviousLevels;

    // Count sessions from events
    const totalSessions = await this.prisma.identityEvent.count({
      where: { rootId, eventType: 'progression.session_completed' },
    });

    // Get recent events for timeline
    const recentEvents = await this.prisma.identityEvent.findMany({
      where: { rootId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // ── Per-Source Progression Breakdown ──────────────────────
    // Compute stats per source from ALL events (not just recent 50)
    const allEvents = await this.prisma.identityEvent.findMany({
      where: { rootId, sourceId: { not: null } },
      select: { eventType: true, sourceId: true, payload: true, changes: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Build source name lookup from links
    const sourceNameMap: Record<string, string> = {};
    for (const l of user.sourceLinks) {
      sourceNameMap[l.sourceId] = l.source.name;
    }

    const sourceStatsMap: Record<string, {
      source_id: string;
      source_name: string;
      sessions: number;
      xp_contributed: number;
      boss_kills: number;
      best_boss_pct: number;
      titles_earned: string[];
      markers: string[];
      caches_granted: number;
      gear_acquired: number;
      first_activity: string | null;
      last_activity: string | null;
    }> = {};

    for (const evt of allEvents) {
      const sid = evt.sourceId!;
      if (!sourceStatsMap[sid]) {
        sourceStatsMap[sid] = {
          source_id: sid,
          source_name: sourceNameMap[sid] || sid.slice(0, 20),
          sessions: 0,
          xp_contributed: 0,
          boss_kills: 0,
          best_boss_pct: 0,
          titles_earned: [],
          markers: [],
          caches_granted: 0,
          gear_acquired: 0,
          first_activity: evt.createdAt.toISOString(),
          last_activity: evt.createdAt.toISOString(),
        };
      }
      const s = sourceStatsMap[sid];
      s.last_activity = evt.createdAt.toISOString();

      const p = (evt.payload || {}) as Record<string, any>;
      const c = (evt.changes || {}) as Record<string, any>;

      switch (evt.eventType) {
        case 'progression.session_completed':
          s.sessions++;
          s.xp_contributed += (c.total_xp || 0);
          if ((p.boss_damage_pct || 0) > 0) {
            s.boss_kills++;
            s.best_boss_pct = Math.max(s.best_boss_pct, p.boss_damage_pct || 0);
          }
          break;
        case 'progression.title_granted':
          if (p.title_id) s.titles_earned.push(p.title_id);
          break;
        case 'progression.fate_marker':
          if (p.marker) s.markers.push(p.marker);
          break;
        case 'loot.cache_granted':
          s.caches_granted++;
          break;
        case 'gear.item_acquired':
          s.gear_acquired++;
          break;
        case 'progression.xp_granted':
          s.xp_contributed += (c.xp_granted || p.xp || 0);
          break;
      }
    }

    const source_progression = Object.values(sourceStatsMap);

    // Get hero rename status
    const renameStatus = await this.getHeroRenameStatus(user.id);

    return {
      identity: {
        root_id: user.id,
        status: user.status,
        enrolled_by: user.enrolledBy,
        enrolled_at: user.enrolledAt.toISOString(),
      },
      persona: {
        persona_id: user.personas[0]?.id ?? null,
        display_name: user.personas[0]?.displayName ?? user.heroName, // Fate Name
        hero_name: user.heroName,
        origin: user.origin,
        fate_alignment: user.fateAlignment,
        equipped_title: user.equippedTitle ?? null,
        hero_rename: renameStatus,
      },
      progression: {
        fate_xp: user.fateXp,
        fate_level: user.fateLevel,
        xp_in_current_level: Math.max(0, xpInCurrentLevel),
        xp_needed_for_next: nextLevelThreshold,
        total_sessions: totalSessions,
        titles: user.titles.map((t) => t.titleId),
        titles_detail: user.titles.map((t) => ({
          title_id: t.titleId,
          display_name: t.title.displayName,
          category: t.title.category,
          granted_at: t.grantedAt.toISOString(),
        })),
        fate_markers: user.fateMarkers.map((m) => m.marker),
      },
      source_links: user.sourceLinks.map((l) => ({
        link_id: l.id,
        source_id: l.sourceId,
        source_name: l.source.name,
        scope: l.scope,
        status: l.status,
        granted_by: l.grantedBy,
        granted_at: l.grantedAt.toISOString(),
        revoked_at: l.revokedAt?.toISOString() ?? null,
        revoked_by: l.revokedBy ?? null,
      })),
      recent_events: recentEvents.map((e) => ({
        event_id: e.id,
        event_type: e.eventType,
        source_id: e.sourceId,
        payload: e.payload,
        changes: e.changes,
        created_at: e.createdAt.toISOString(),
      })),
      source_progression,
      fate_caches: (user.fateCaches || []).map((c) => ({
        cache_id: c.id,
        cache_type: c.cacheType,
        rarity: c.rarity,
        status: c.status,
        trigger: c.trigger,
        granted_at: c.grantedAt.toISOString(),
        opened_at: c.openedAt?.toISOString() ?? null,
        reward: c.status === 'opened'
          ? { type: c.rewardType, value: c.rewardValue, name: c.rewardName, rarity: c.rewardRarity }
          : null,
      })),
      gear: {
        inventory: inventoryData.map((inv: any) => ({
          inventory_id: inv.id,
          item_id: inv.item.id,
          item_name: inv.item.name,
          slot: inv.item.slot,
          rarity: inv.item.rarityTier,
          icon: inv.item.icon,
          description: inv.item.description,
          lore_text: inv.item.loreText,
          modifiers: inv.item.modifiers,
          acquired_via: inv.acquiredVia,
          acquired_at: inv.acquiredAt.toISOString(),
          is_equipped: !!inv.equipment,
        })),
        equipment: Object.fromEntries(
          ['weapon', 'helm', 'chest', 'arms', 'legs', 'rune'].map((slot) => {
            const eq = equipmentData.find((e: any) => e.slot === slot);
            return [slot, eq ? {
              inventory_id: eq.inventoryId,
              item_id: eq.inventory.item.id,
              item_name: eq.inventory.item.name,
              rarity: eq.inventory.item.rarityTier,
              icon: eq.inventory.item.icon,
              modifiers: eq.inventory.item.modifiers,
            } : null];
          }),
        ),
        computed_modifiers: equipmentData.reduce(
          (totals: Record<string, number>, eq: any) => {
            const mods = (eq.inventory.item.modifiers || {}) as Record<string, number>;
            for (const [k, v] of Object.entries(mods)) {
              totals[k] = (totals[k] || 0) + v;
            }
            return totals;
          },
          { xp_bonus_pct: 0, boss_damage_pct: 0, luck_pct: 0, defense: 0, crit_pct: 0, cooldown_pct: 0, fate_affinity: 0 } as Record<string, number>,
        ),
      },
      sessions: {
        active: activeSession ? {
          session_id: activeSession.id,
          source_id: activeSession.sourceId,
          zone: activeSession.zone,
          checked_in_at: activeSession.checkedInAt.toISOString(),
          duration_sec: Math.round((Date.now() - activeSession.checkedInAt.getTime()) / 1000),
        } : null,
        recent: sessionData.map((s: any) => ({
          session_id: s.id,
          source_id: s.sourceId,
          zone: s.zone,
          status: s.status,
          checked_in_at: s.checkedInAt.toISOString(),
          checked_out_at: s.checkedOutAt?.toISOString() ?? null,
          duration_sec: s.durationSec ?? Math.round((Date.now() - s.checkedInAt.getTime()) / 1000),
          summary: s.summary,
        })),
        total_completed: sessionData.filter((s: any) => s.status === 'completed').length,
      },
      wearables: wearableData.map((t: any) => ({
        token_id: t.id,
        token_type: t.tokenType,
        token_uid: t.tokenUid,
        friendly_name: t.friendlyName,
        status: t.status,
        issued_at: t.issuedAt.toISOString(),
        last_tap_at: t.lastTapAt?.toISOString() ?? null,
        tap_count: t.tapCount,
      })),
      quests: questData.map((pq: any) => {
        const objectives = (pq.quest.objectives as any[]) || [];
        const progress = (pq.progress as any[]) || [];
        const completedCount = progress.filter((p: any) => p.completed).length;
        return {
          player_quest_id: pq.id,
          quest_id: pq.questId,
          name: pq.quest.name,
          description: pq.quest.description,
          quest_type: pq.quest.questType,
          status: pq.status,
          progress: `${completedCount}/${objectives.length}`,
          objectives: objectives.map((obj: any) => {
            const prog = progress.find((p: any) => p.objective_id === obj.id);
            return {
              id: obj.id,
              label: obj.label,
              completed: prog?.completed || false,
              current: prog?.current ?? 0,
              target: obj.target,
            };
          }),
          rewards: pq.quest.rewards,
          started_at: pq.startedAt.toISOString(),
          completed_at: pq.completedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  // ── TIMELINE ──────────────────────────────────────────────

  async getTimeline(rootId: string) {
    const exists = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }
    return this.events.getTimeline(rootId);
  }

  // ── UPDATE PROFILE ────────────────────────────────────────

  async updateProfile(
    rootId: string,
    dto: { hero_name?: string; fate_alignment?: string; origin?: string },
  ) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }
    if (user.status !== 'active') {
      throw new BadRequestException(`Identity is ${user.status}`);
    }

    const updateData: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (dto.hero_name && dto.hero_name !== user.heroName) {
      // ── Name change limit: 1 free hero creation + 1 free rename ──
      const nameChangeCount = await this.countHeroNameChanges(rootId);
      // First change (index 0) = hero creation, second (index 1) = free rename
      // Block at 2+ (hero creation + 1 free rename already used)
      if (nameChangeCount >= 2) {
        throw new BadRequestException({
          message: 'No free hero name changes remaining',
          hero_renames_used: nameChangeCount - 1, // subtract hero creation
          hero_renames_allowed: 1,
        });
      }

      // ── Hero name uniqueness check (case-insensitive) ──
      const existingName = await this.prisma.rootIdentity.findFirst({
        where: {
          heroName: { equals: dto.hero_name, mode: 'insensitive' },
          status: 'active',
          id: { not: rootId },  // exclude self
        },
        select: { id: true, heroName: true },
      });
      if (existingName) {
        const suggestions = await this.suggestHeroNames(dto.hero_name);
        throw new ConflictException({
          message: `Hero name "${dto.hero_name}" is already taken`,
          taken_name: dto.hero_name,
          suggestions,
        });
      }

      updateData.heroName = dto.hero_name;
      changes.hero_name = { from: user.heroName, to: dto.hero_name };

      // NOTE: persona.displayName is NOT synced here.
      // displayName = Fate Name (permanent account identity, set at enrollment)
      // heroName = Hero Name (in-game character, changeable via updateProfile)
    }

    if (dto.fate_alignment && dto.fate_alignment !== user.fateAlignment) {
      updateData.fateAlignment = dto.fate_alignment;
      changes.fate_alignment = { from: user.fateAlignment, to: dto.fate_alignment };
    }

    if (dto.origin !== undefined && dto.origin !== user.origin) {
      updateData.origin = dto.origin || null;
      changes.origin = { from: user.origin, to: dto.origin || null };
    }

    if (Object.keys(updateData).length === 0) {
      return { message: 'No changes', root_id: rootId };
    }

    try {
      await this.prisma.rootIdentity.update({
        where: { id: rootId },
        data: updateData,
      });
    } catch (err) {
      // Race condition: unique constraint violation at DB level
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const suggestions = await this.suggestHeroNames(dto.hero_name!);
        throw new ConflictException({
          message: `Hero name "${dto.hero_name}" is already taken`,
          taken_name: dto.hero_name,
          suggestions,
        });
      }
      throw err;
    }

    await this.events.log({
      rootId,
      eventType: 'identity.profile_updated',
      payload: dto,
      changes: changes as unknown as Record<string, unknown>,
    });

    this.logger.log(`Profile updated: ${rootId} — ${JSON.stringify(changes)}`);

    return {
      root_id: rootId,
      ...updateData,
      changes,
    };
  }

  // ── EQUIP TITLE ───────────────────────────────────────────

  async equipTitle(rootId: string, titleId: string | null) {
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: { titles: { select: { titleId: true } } },
    });
    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }

    // null = unequip
    if (titleId !== null) {
      // Verify user actually holds this title
      const held = user.titles.some((t) => t.titleId === titleId);
      if (!held) {
        throw new BadRequestException(
          `You do not hold title: ${titleId}`,
        );
      }
    }

    const prev = user.equippedTitle;
    await this.prisma.rootIdentity.update({
      where: { id: rootId },
      data: { equippedTitle: titleId },
    });

    await this.events.log({
      rootId,
      eventType: 'identity.title_equipped',
      payload: { title_id: titleId, previous: prev },
    });

    this.logger.log(
      `Title equipped: ${rootId} → ${titleId || 'none'} (was ${prev || 'none'})`,
    );

    return {
      root_id: rootId,
      equipped_title: titleId,
      previous: prev,
    };
  }

  // ── DISMANTLE ─────────────────────────────────────────────

  async dismantleItem(rootId: string, inventoryId: string) {
    // 1. Verify the inventory record exists and belongs to this player
    const inv = await this.prisma.playerInventory.findFirst({
      where: { id: inventoryId, rootId },
      include: { item: true, equipment: true },
    });

    if (!inv) {
      throw new NotFoundException(
        `Inventory item not found: ${inventoryId}`,
      );
    }

    // 2. Cannot dismantle equipped items
    if (inv.equipment) {
      throw new BadRequestException(
        `Cannot dismantle equipped item. Unequip it first.`,
      );
    }

    // 3. Calculate Nexus yield based on rarity
    const rarity = (inv.item.rarityTier || 'common').toLowerCase();
    const nexusGained = this.NEXUS_YIELD[rarity] || this.NEXUS_YIELD.common;

    // 4. Delete the inventory record
    await this.prisma.playerInventory.delete({
      where: { id: inventoryId },
    });

    // 5. Log the event
    await this.events.log({
      rootId,
      eventType: 'gear.item_dismantled',
      payload: {
        inventory_id: inventoryId,
        item_id: inv.item.id,
        item_name: inv.item.name,
        rarity: inv.item.rarityTier,
        nexus_gained: nexusGained,
      },
    });

    this.logger.log(
      `Item dismantled: ${rootId} → ${inv.item.name} (${rarity}) → +${nexusGained} Nexus`,
    );

    return {
      root_id: rootId,
      inventory_id: inventoryId,
      item_name: inv.item.name,
      rarity: inv.item.rarityTier,
      nexus_gained: nexusGained,
    };
  }

  // ── HELPERS ───────────────────────────────────────────────

  /**
   * Count how many times a user has changed their hero name.
   * Counts identity.profile_updated events where changes include hero_name.
   */
  private async countHeroNameChanges(rootId: string): Promise<number> {
    // We can't filter on JSON content directly in a count, so fetch minimal data
    const events = await this.prisma.identityEvent.findMany({
      where: {
        rootId,
        eventType: 'identity.profile_updated',
      },
      select: { changes: true },
    });
    return events.filter((e) => {
      const changes = e.changes as Record<string, unknown> | null;
      return changes && 'hero_name' in changes;
    }).length;
  }

  /**
   * Get how many free hero renames remain for a user.
   * Returns { used, allowed, remaining }.
   */
  async getHeroRenameStatus(rootId: string) {
    const nameChangeCount = await this.countHeroNameChanges(rootId);
    // First change = hero creation (doesn't count as rename)
    const renamesUsed = Math.max(0, nameChangeCount - 1);
    const renamesAllowed = 1; // Free allotment
    return {
      renames_used: renamesUsed,
      renames_allowed: renamesAllowed,
      renames_remaining: Math.max(0, renamesAllowed - renamesUsed),
    };
  }

  /**
   * Generate available hero name suggestions by appending sequential numbers.
   * Returns up to 3 available names.
   */
  private async suggestHeroNames(baseName: string): Promise<string[]> {
    // Fetch all names that start with this base (case-insensitive)
    const similar = await this.prisma.rootIdentity.findMany({
      where: {
        heroName: { startsWith: baseName, mode: 'insensitive' },
        status: 'active',
      },
      select: { heroName: true },
    });
    const takenSet = new Set(similar.map((u) => u.heroName.toLowerCase()));

    const suggestions: string[] = [];
    for (let i = 1; suggestions.length < 3 && i <= 99; i++) {
      const candidate = `${baseName}${i}`;
      if (!takenSet.has(candidate.toLowerCase())) {
        suggestions.push(candidate);
      }
    }
    return suggestions;
  }

  async getProgressionConfig() {
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

    return {
      xpBaseThreshold: parseFloat(map.get('fate.xp_base_threshold') ?? '200'),
      xpLevelMultiplier: parseFloat(map.get('fate.xp_level_multiplier') ?? '1.2'),
      xpPerSessionNormal: parseFloat(map.get('fate.xp_per_session_normal') ?? '100'),
      xpPerSessionHard: parseFloat(map.get('fate.xp_per_session_hard') ?? '150'),
      xpNodeCompletion: parseFloat(map.get('fate.xp_node_completion') ?? '15'),
      xpBossTierPct: parseFloat(map.get('fate.xp_boss_tier_pct') ?? '0.5'),
      eventXpMultiplier: parseFloat(map.get('fate.event_xp_multiplier') ?? '1.0'),
    };
  }
}
