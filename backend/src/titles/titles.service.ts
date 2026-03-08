// src/titles/titles.service.ts
// ============================================================
// Sprint 8 — Vault: Titles
// GET earned titles for a hero
// POST equip a title
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TitlesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── GET /api/users/:rootId/titles ────────────────────────
  // Returns all titles the hero has earned, plus locked titles
  // with their unlock condition shown.

  async getTitles(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: { titles: { include: { title: true } } },
    });
    if (!hero || hero.status !== 'active') throw new NotFoundException('Hero not found');

    // All titles in the registry
    const allTitles = await this.prisma.title.findMany();

    // Titles the hero has earned
    const earnedIds = new Set(hero.titles.map(ut => ut.titleId));

    return allTitles.map(t => ({
      title_id:    t.id,
      display_name: t.displayName,
      category:    t.category ?? 'general',
      description: t.description ?? null,
      is_earned:   earnedIds.has(t.id),
      is_equipped: hero.equippedTitle === t.id,
      granted_at:  hero.titles.find(ut => ut.titleId === t.id)?.grantedAt?.toISOString() ?? null,
    }));
  }

  // ── POST /api/users/:rootId/titles/:titleId/equip ────────
  // Equips a title the hero has earned. Pass titleId = 'none' to unequip.

  async equipTitle(rootId: string, titleId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      include: { titles: true },
    });
    if (!hero || hero.status !== 'active') throw new NotFoundException('Hero not found');

    if (titleId === 'none') {
      await this.prisma.rootIdentity.update({
        where: { id: rootId },
        data: { equippedTitle: null },
      });
      return { equipped_title: null, message: 'Title removed.' };
    }

    // Check the hero owns this title
    const owned = hero.titles.some(ut => ut.titleId === titleId);
    if (!owned) throw new BadRequestException('Title not earned');

    // Verify title exists
    const title = await this.prisma.title.findUnique({ where: { id: titleId } });
    if (!title) throw new NotFoundException('Title not found');

    await this.prisma.rootIdentity.update({
      where: { id: rootId },
      data: { equippedTitle: titleId },
    });

    return {
      equipped_title: titleId,
      display_name:   title.displayName,
      message:        `"${title.displayName}" — your word is now your name.`,
    };
  }
}
