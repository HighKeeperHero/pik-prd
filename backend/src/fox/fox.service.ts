// ============================================================
// PIK — Fate Fox service (the Calling, 2026-07-09)
//
// The fox is REVEALED, not built: the Calling's memory-choices
// score hidden virtues; the top pair picks the archetype; the
// archetype fixes immutable traits; the player customizes
// expression only. Gate: Fate level 50 (The Silent Witness).
// Bonding sets the Sprint 31 FateFox row → the +5% XP nudge in
// LevelingService activates through the existing seam.
// ============================================================

import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { QuestLogService, type QuestProgressUpdate } from '../quest/quest-log.service';
import {
  ARCHETYPES, CALLING_QUESTIONS, AURA_COLORS, COLLARS, EYE_COLORS,
  FUR_PALETTES, PENDANTS, VIRTUES, mythicName, type Virtue,
} from './fox-catalog';

export const FOX_FATE_UNLOCK = 50;

const WITNESS_BEATS = ['investigate', 'follow', 'shrine'] as const;
export type WitnessBeat = (typeof WITNESS_BEATS)[number];

@Injectable()
export class FoxService {
  private readonly logger = new Logger(FoxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questLog: QuestLogService,
  ) {}

  private async hero(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { fateLevel: true },
    });
    if (!hero) throw new BadRequestException('Unknown hero.');
    return hero;
  }

  private requireUnlocked(fateLevel: number) {
    if (fateLevel < FOX_FATE_UNLOCK) {
      throw new ForbiddenException('The Veil has not yet answered.');
    }
  }

  /** Unlock state + profile — the client's single source. */
  async status(rootId: string) {
    const hero = await this.hero(rootId);
    const fox = await this.prisma.fateFox.findUnique({ where: { rootId } });
    return {
      unlocked:     hero.fateLevel >= FOX_FATE_UNLOCK,
      unlock_level: FOX_FATE_UNLOCK,
      fate_level:   hero.fateLevel,
      fox:          fox ? this.view(fox) : null,
    };
  }

  /** The Calling's memories — WITHOUT the virtue scores. */
  async calling(rootId: string) {
    const hero = await this.hero(rootId);
    this.requireUnlocked(hero.fateLevel);
    return {
      questions: CALLING_QUESTIONS.map(q => ({
        id: q.id,
        memory: q.memory,
        prompt: q.prompt,
        options: q.options.map(o => ({ id: o.id, text: o.text })),
      })),
    };
  }

  /** Score the answers, reveal the fox, bond it. One reveal per
   *  hero for life — the bond is permanent on both sides. */
  async submitCalling(rootId: string, answers: Record<string, string>) {
    const hero = await this.hero(rootId);
    this.requireUnlocked(hero.fateLevel);
    const existing = await this.prisma.fateFox.findUnique({ where: { rootId } });
    if (existing?.revealedAt) {
      throw new ConflictException('Your Fate has already answered.');
    }

    // Hidden virtue scoring.
    const profile = Object.fromEntries(VIRTUES.map(v => [v, 0])) as Record<Virtue, number>;
    let answered = 0;
    for (const q of CALLING_QUESTIONS) {
      const opt = q.options.find(o => o.id === answers[q.id]);
      if (!opt) continue;
      answered++;
      for (const [v, pts] of Object.entries(opt.scores)) {
        profile[v as Virtue] += pts ?? 0;
      }
    }
    if (answered < CALLING_QUESTIONS.length) {
      throw new BadRequestException('The shrine requires every memory answered.');
    }

    // Top-2 virtues pick the archetype (best pair-overlap wins;
    // deterministic tiebreak by catalog order).
    const ranked = [...VIRTUES].sort((a, b) => profile[b] - profile[a]);
    const top = new Set(ranked.slice(0, 3));
    const archetype =
      ARCHETYPES.map(a => ({
        a,
        score: (top.has(a.virtues[0]) ? 2 : 0) + (top.has(a.virtues[1]) ? 2 : 0) +
               profile[a.virtues[0]] + profile[a.virtues[1]],
      })).sort((x, y) => y.score - x.score)[0].a;

    // Mythic name from the virtue fingerprint (stable per profile).
    const seed = VIRTUES.reduce((acc, v, i) => acc + profile[v] * (i + 3), answered);
    const name = mythicName(seed);

    const fox = await this.prisma.fateFox.upsert({
      where:  { rootId },
      create: {
        rootId, name,
        archetype:       archetype.id,
        virtueProfile:   profile,
        immutableTraits: { ...archetype.traits, posture: archetype.posture },
        customization: {
          furPrimary: FUR_PALETTES[0].id, furSecondary: FUR_PALETTES[0].id,
          eyeColor: EYE_COLORS[0].id, collar: COLLARS[0].id,
          pendant: PENDANTS[0].id, auraColor: AURA_COLORS[0].id,
        },
        personalitySeed: archetype.personalitySeed,
        revealedAt:      new Date(),
      },
      update: {
        archetype:       archetype.id,
        virtueProfile:   profile,
        immutableTraits: { ...archetype.traits, posture: archetype.posture },
        personalitySeed: archetype.personalitySeed,
        revealedAt:      new Date(),
      },
    });

    // Identity record + quest advancement (calling, then bond —
    // the reveal IS the bond; the dream-realm beat is presentation).
    await this.prisma.identityEvent.create({
      data: {
        rootId,
        eventType: 'identity.fox_revealed',
        payload:   { archetype: archetype.id, name },
      },
    }).catch(() => { /* identity ledger is best-effort */ });

    const updates: QuestProgressUpdate[] = [
      ...await this.questLog.recordEvent(rootId, { type: 'fox', beat: 'calling' }),
      ...await this.questLog.recordEvent(rootId, { type: 'fox', beat: 'bond' }),
    ];

    this.logger.log(`Fate revealed: ${rootId} ↔ ${archetype.id} "${name}"`);
    return { fox: this.view(fox), quest_updates: updates };
  }

  /** Expression only — archetype, traits, and soul are immutable. */
  async customize(rootId: string, input: {
    name?: string;
    furPrimary?: string; furSecondary?: string; eyeColor?: string;
    collar?: string; pendant?: string; auraColor?: string;
  }) {
    const fox = await this.prisma.fateFox.findUnique({ where: { rootId } });
    if (!fox?.revealedAt) throw new BadRequestException('No fox has been revealed.');

    const inCatalog = (id: string | undefined, cat: Array<{ id: string }>) =>
      id === undefined || cat.some(c => c.id === id);
    if (!inCatalog(input.furPrimary, FUR_PALETTES) ||
        !inCatalog(input.furSecondary, FUR_PALETTES) ||
        !inCatalog(input.eyeColor, EYE_COLORS) ||
        !inCatalog(input.collar, COLLARS) ||
        !inCatalog(input.pendant, PENDANTS) ||
        !inCatalog(input.auraColor, AURA_COLORS)) {
      throw new BadRequestException('Unknown adornment.');
    }
    const name = input.name?.trim();
    if (name !== undefined && (name.length < 2 || name.length > 24)) {
      throw new BadRequestException('A name carries 2–24 letters.');
    }

    const prev = (fox.customization ?? {}) as Record<string, string>;
    const updated = await this.prisma.fateFox.update({
      where: { rootId },
      data: {
        ...(name ? { name } : {}),
        customization: {
          ...prev,
          ...(input.furPrimary   ? { furPrimary: input.furPrimary } : {}),
          ...(input.furSecondary ? { furSecondary: input.furSecondary } : {}),
          ...(input.eyeColor     ? { eyeColor: input.eyeColor } : {}),
          ...(input.collar       ? { collar: input.collar } : {}),
          ...(input.pendant      ? { pendant: input.pendant } : {}),
          ...(input.auraColor    ? { auraColor: input.auraColor } : {}),
        },
      },
    });
    return { fox: this.view(updated) };
  }

  /** Silent Witness world beats (quests 1-3) — the client's
   *  placeholder scenes fire these; Tim's real scenes will too. */
  async witness(rootId: string, beat: string) {
    const hero = await this.hero(rootId);
    this.requireUnlocked(hero.fateLevel);
    if (!WITNESS_BEATS.includes(beat as WitnessBeat)) {
      throw new BadRequestException('Unknown beat.');
    }
    const updates = await this.questLog.recordEvent(rootId, { type: 'fox', beat });
    return { quest_updates: updates };
  }

  /** Customization catalogs for the client pickers. */
  catalogs() {
    return {
      fur_palettes: FUR_PALETTES,
      eye_colors:   EYE_COLORS,
      collars:      COLLARS,
      pendants:     PENDANTS,
      aura_colors:  AURA_COLORS,
    };
  }

  private view(fox: {
    name: string; archetype: string | null; virtueProfile: unknown;
    immutableTraits: unknown; customization: unknown; bondLevel: number;
    personalitySeed: string | null; bondedAt: Date; revealedAt: Date | null;
  }) {
    const meta = ARCHETYPES.find(a => a.id === fox.archetype) ?? null;
    return {
      name:             fox.name,
      archetype:        fox.archetype,
      archetype_title:  meta?.title ?? null,
      archetype_nature: meta?.nature ?? null,
      virtue_profile:   fox.virtueProfile ?? null,
      immutable_traits: fox.immutableTraits ?? null,
      customization:    fox.customization ?? null,
      bond_level:       fox.bondLevel,
      personality_seed: fox.personalitySeed,
      bonded_at:        fox.bondedAt,
      revealed_at:      fox.revealedAt,
    };
  }
}
