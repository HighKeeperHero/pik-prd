// ============================================================
// WarbandService — Sprint 23
//
// Warband formation, membership, and invite system.
// Max 6 members. Open alignment but alignment bonuses
// awarded to members matching Warband primary alignment.
//
// Rank hierarchy: FOUNDER > OFFICER > MEMBER
// - FOUNDER: one per Warband, cannot leave (must disband)
// - OFFICER: can invite, rename, kick MEMBERs
// - MEMBER: can leave
//
// Place at: src/warband/warband.service.ts
// ============================================================

import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const MAX_MEMBERS  = 6;
const INVITE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const RANK_ORDER   = ['MEMBER', 'OFFICER', 'FOUNDER'];
const VALID_GLYPHS = ['⚔','🛡','🏹','⚡','◈','✦','🌿','⚓','🃏','⚙','📖','🐉'];

function rankLevel(rank: string) { return RANK_ORDER.indexOf(rank); }

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

@Injectable()
export class WarbandService {
  private readonly logger = new Logger(WarbandService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────────────────
  async createWarband(rootId: string, dto: {
    name:      string;
    emblem?:   string;
    alignment?: string;
  }) {
    // Must not already be in a Warband
    const existing = await this.prisma.warbandMembership.findFirst({ where: { rootId } });
    if (existing) throw new BadRequestException('You are already in a Warband. Leave it before creating a new one.');

    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { id: true, heroName: true, fateAlignment: true },
    });
    if (!hero) throw new NotFoundException('Hero not found');

    const name = dto.name.trim();
    if (name.length < 2 || name.length > 32) {
      throw new BadRequestException('Warband name must be 2–32 characters.');
    }

    const emblem    = VALID_GLYPHS.includes(dto.emblem ?? '') ? dto.emblem! : '⚔';
    const alignment = dto.alignment ?? hero.fateAlignment ?? 'NONE';

    const warband = await this.prisma.$transaction(async (tx) => {
      const w = await tx.warband.create({
        data: { name, emblem, alignment, founderRootId: rootId },
      });
      await tx.warbandMembership.create({
        data: {
          warbandId:      w.id,
          rootId,
          rank:           'FOUNDER',
          alignmentBonus: hero.fateAlignment === alignment,
        },
      });
      return w;
    });

    this.logger.log(`Warband created: "${warband.name}" by ${rootId}`);
    return this._formatWarband(warband, rootId);
  }

  // ── Get warband by ID ─────────────────────────────────────────────────────
  async getWarband(warbandId: string, requestingRootId?: string) {
    const w = await this.prisma.warband.findUnique({
      where:   { id: warbandId },
      include: { members: { include: { hero: { select: { heroName: true, fateAlignment: true, heroLevel: true } } } } },
    });
    if (!w) throw new NotFoundException('Warband not found');
    return this._formatWarbandFull(w, requestingRootId);
  }

  // ── Get hero's warband ────────────────────────────────────────────────────
  async getMyWarband(rootId: string) {
    const membership = await this.prisma.warbandMembership.findFirst({
      where:   { rootId },
      include: { warband: { include: { members: { include: { hero: { select: { heroName: true, fateAlignment: true, heroLevel: true } } } } } } },
    });
    if (!membership) return null;
    return this._formatWarbandFull(membership.warband, rootId);
  }

  // ── Create invite ─────────────────────────────────────────────────────────
  async createInvite(warbandId: string, requestingRootId: string) {
    const membership = await this._requireMembership(warbandId, requestingRootId);
    if (rankLevel(membership.rank) < rankLevel('OFFICER')) {
      throw new ForbiddenException('Only Officers and Founders can create invites.');
    }

    const memberCount = await this.prisma.warbandMembership.count({ where: { warbandId } });
    if (memberCount >= MAX_MEMBERS) {
      throw new BadRequestException(`Warband is full (${MAX_MEMBERS} members max).`);
    }

    // Generate unique code
    let code = generateInviteCode();
    let attempts = 0;
    while (await this.prisma.warbandInvite.findUnique({ where: { inviteCode: code } })) {
      code = generateInviteCode();
      if (++attempts > 10) throw new BadRequestException('Could not generate unique invite code. Try again.');
    }

    const invite = await this.prisma.warbandInvite.create({
      data: {
        warbandId,
        invitedByRootId: requestingRootId,
        inviteCode: code,
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITE_TTL),
      },
    });

    const warband = await this.prisma.warband.findUnique({ where: { id: warbandId } });
    this.logger.log(`Invite created: ${code} for "${warband?.name}" by ${requestingRootId}`);

    return {
      invite_code: invite.inviteCode,
      warband_id:  warbandId,
      warband_name: warband?.name,
      expires_at:  invite.expiresAt.toISOString(),
    };
  }

  // ── Accept invite ─────────────────────────────────────────────────────────
  async acceptInvite(rootId: string, inviteCode: string) {
    const invite = await this.prisma.warbandInvite.findUnique({ where: { inviteCode } });
    if (!invite) throw new NotFoundException('Invite code not found.');
    if (invite.status !== 'pending') throw new BadRequestException('This invite has already been used or expired.');
    if (invite.expiresAt < new Date()) {
      await this.prisma.warbandInvite.update({ where: { id: invite.id }, data: { status: 'expired' } });
      throw new BadRequestException('This invite has expired.');
    }

    // Check hero not already in a Warband
    const existing = await this.prisma.warbandMembership.findFirst({ where: { rootId } });
    if (existing) throw new BadRequestException('You are already in a Warband.');

    // Check Warband not full
    const memberCount = await this.prisma.warbandMembership.count({ where: { warbandId: invite.warbandId } });
    if (memberCount >= MAX_MEMBERS) throw new BadRequestException('This Warband is full.');

    const hero    = await this.prisma.rootIdentity.findUnique({ where: { id: rootId }, select: { fateAlignment: true } });
    const warband = await this.prisma.warband.findUnique({ where: { id: invite.warbandId } });
    if (!warband) throw new NotFoundException('Warband no longer exists.');

    await this.prisma.$transaction([
      this.prisma.warbandMembership.create({
        data: {
          warbandId:      invite.warbandId,
          rootId,
          rank:           'MEMBER',
          alignmentBonus: hero?.fateAlignment === warband.alignment,
        },
      }),
      this.prisma.warbandInvite.update({
        where: { id: invite.id },
        data:  { status: 'accepted' },
      }),
    ]);

    this.logger.log(`${rootId} joined Warband "${warband.name}" via invite ${inviteCode}`);
    return this._formatWarband(warband, rootId);
  }

  // ── Leave warband ─────────────────────────────────────────────────────────
  async leaveWarband(warbandId: string, rootId: string) {
    const membership = await this._requireMembership(warbandId, rootId);

    if (membership.rank === 'FOUNDER') {
      throw new BadRequestException('Founders cannot leave. Disband the Warband or transfer Founder rank first.');
    }

    await this.prisma.warbandMembership.delete({ where: { id: membership.id } });
    this.logger.log(`${rootId} left Warband ${warbandId}`);
    return { left: true, warband_id: warbandId };
  }

  // ── Kick member ───────────────────────────────────────────────────────────
  async kickMember(warbandId: string, requestingRootId: string, targetRootId: string) {
    const requester = await this._requireMembership(warbandId, requestingRootId);
    const target    = await this._requireMembership(warbandId, targetRootId);

    if (rankLevel(requester.rank) <= rankLevel(target.rank)) {
      throw new ForbiddenException('You can only kick members with a lower rank than yours.');
    }

    await this.prisma.warbandMembership.delete({ where: { id: target.id } });
    this.logger.log(`${requestingRootId} kicked ${targetRootId} from Warband ${warbandId}`);
    return { kicked: true, target_root_id: targetRootId };
  }

  // ── Promote / demote ──────────────────────────────────────────────────────
  async setRank(warbandId: string, requestingRootId: string, targetRootId: string, newRank: string) {
    if (!['OFFICER', 'MEMBER'].includes(newRank)) {
      throw new BadRequestException('Rank must be OFFICER or MEMBER. FOUNDER cannot be assigned.');
    }

    const requester = await this._requireMembership(warbandId, requestingRootId);
    if (requester.rank !== 'FOUNDER') throw new ForbiddenException('Only Founders can change ranks.');

    const target = await this._requireMembership(warbandId, targetRootId);
    if (target.rank === 'FOUNDER') throw new ForbiddenException('Cannot change Founder rank.');

    await this.prisma.warbandMembership.update({
      where: { id: target.id },
      data:  { rank: newRank },
    });

    return { updated: true, target_root_id: targetRootId, new_rank: newRank };
  }

  // ── Rename warband ────────────────────────────────────────────────────────
  async renameWarband(warbandId: string, requestingRootId: string, newName: string) {
    const membership = await this._requireMembership(warbandId, requestingRootId);
    if (rankLevel(membership.rank) < rankLevel('OFFICER')) {
      throw new ForbiddenException('Only Officers and Founders can rename the Warband.');
    }

    const name = newName.trim();
    if (name.length < 2 || name.length > 32) throw new BadRequestException('Name must be 2–32 characters.');

    const updated = await this.prisma.warband.update({ where: { id: warbandId }, data: { name } });
    return { renamed: true, name: updated.name };
  }

  // ── Disband ───────────────────────────────────────────────────────────────
  async disbandWarband(warbandId: string, requestingRootId: string) {
    const membership = await this._requireMembership(warbandId, requestingRootId);
    if (membership.rank !== 'FOUNDER') throw new ForbiddenException('Only the Founder can disband a Warband.');

    await this.prisma.warband.delete({ where: { id: warbandId } });
    this.logger.log(`Warband ${warbandId} disbanded by ${requestingRootId}`);
    return { disbanded: true };
  }

  // ── Search warbands ───────────────────────────────────────────────────────
  async searchWarbands(query?: string, alignment?: string) {
    const where: any = {};
    if (alignment && alignment !== 'ALL') where.alignment = alignment;
    if (query) where.name = { contains: query, mode: 'insensitive' };

    const warbands = await this.prisma.warband.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: { reputation: 'desc' },
      take: 20,
    });

    return warbands.map(w => ({
      warband_id:   w.id,
      name:         w.name,
      emblem:       w.emblem,
      alignment:    w.alignment,
      reputation:   w.reputation,
      member_count: w._count.members,
      is_full:      w._count.members >= MAX_MEMBERS,
    }));
  }

  // ── Hero profile (public) ─────────────────────────────────────────────────
  async getHeroPublicProfile(targetRootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: targetRootId },
      select: {
        id: true, heroName: true, fateAlignment: true,
        heroLevel: true, heroClass: true, equippedTitle: true,
        titles: { select: { titleId: true } },
        warbandMemberships: {
          include: { warband: { select: { id: true, name: true, emblem: true } } },
        },
        events: {
          where:   { eventType: { in: ['identity.tier_ascension', 'identity.hero_awakened', 'identity.class_selected', 'identity.title_earned'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { eventType: true, payload: true, createdAt: true },
        },
      },
    });
    if (!hero) throw new NotFoundException('Hero not found');

    const membership = hero.warbandMemberships[0] ?? null;

    return {
      root_id:        hero.id,
      hero_name:      hero.heroName,
      alignment:      hero.fateAlignment,
      hero_level:     hero.heroLevel,
      hero_class:     hero.heroClass,
      equipped_title: hero.equippedTitle,
      title_count:    hero.titles.length,
      warband: membership ? {
        warband_id: membership.warband.id,
        name:       membership.warband.name,
        emblem:     membership.warband.emblem,
        rank:       membership.rank,
      } : null,
      recent_milestones: hero.events.map(e => ({
        event_type: e.eventType,
        payload:    e.payload,
        ts:         (e.createdAt as Date).getTime(),
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async _requireMembership(warbandId: string, rootId: string) {
    const m = await this.prisma.warbandMembership.findUnique({
      where: { warbandId_rootId: { warbandId, rootId } },
    });
    if (!m) throw new ForbiddenException('You are not a member of this Warband.');
    return m;
  }

  private _formatWarband(w: any, rootId?: string) {
    return {
      warband_id:    w.id,
      name:          w.name,
      emblem:        w.emblem,
      alignment:     w.alignment,
      reputation:    w.reputation,
      founded_at:    w.foundedAt?.toISOString?.() ?? w.founded_at,
    };
  }

  private _formatWarbandFull(w: any, requestingRootId?: string) {
    const myMembership = requestingRootId
      ? w.members?.find((m: any) => m.rootId === requestingRootId)
      : null;

    return {
      warband_id:  w.id,
      name:        w.name,
      emblem:      w.emblem,
      alignment:   w.alignment,
      reputation:  w.reputation,
      founded_at:  w.foundedAt?.toISOString?.() ?? w.founded_at,
      my_rank:     myMembership?.rank ?? null,
      member_count: w.members?.length ?? 0,
      is_full:     (w.members?.length ?? 0) >= MAX_MEMBERS,
      members: (w.members ?? []).map((m: any) => ({
        root_id:         m.rootId,
        hero_name:       m.hero?.heroName ?? 'Unknown',
        alignment:       m.hero?.fateAlignment ?? 'NONE',
        hero_level:      m.hero?.heroLevel ?? 1,
        rank:            m.rank,
        alignment_bonus: m.alignmentBonus,
        joined_at:       m.joinedAt?.toISOString?.() ?? m.joined_at,
      })).sort((a: any, b: any) => rankLevel(b.rank) - rankLevel(a.rank)),
    };
  }
}
