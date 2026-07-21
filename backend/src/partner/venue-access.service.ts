// ============================================================
// HEP Phase 2 — venue check-in service
//
// Consent + presence, initiated by the player.
//
// Place at: src/partner/venue-access.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { intersectScopes, splitScope } from '../auth/scopes';

@Injectable()
export class VenueAccessService {
  private readonly logger = new Logger(VenueAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Public description — what the consent screen shows before asking. */
  async describe(sourceId: string) {
    const venue = await this.prisma.source.findUnique({
      where: { id: sourceId },
      select: { id: true, name: true, status: true, scopes: true, profile: true },
    });

    if (!venue || venue.status !== 'active') {
      throw new NotFoundException('That venue is not recognised');
    }

    const experiences = await this.prisma.venueExperience.findMany({
      where: { sourceId, enabled: true },
      include: { experience: { select: { slug: true, name: true } } },
    });

    const profile = (venue.profile ?? {}) as Record<string, unknown>;

    return {
      source_id: venue.id,
      name: profile.display_name ?? venue.name,
      /** Exactly what the venue will be permitted to write. */
      grants: splitScope(venue.scopes),
      experiences: experiences.map((e) => ({
        slug: e.experience.slug,
        name: e.experience.name,
      })),
    };
  }

  /**
   * Check in: establish consent if it does not exist, then open a session.
   *
   * Idempotent — walking back in after stepping out reuses the existing
   * consent and returns the live session rather than stacking duplicates.
   */
  async checkIn(sourceId: string, rootId: string, zone?: string) {
    const venue = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });
    if (!venue || venue.status !== 'active') {
      throw new NotFoundException('That venue is not recognised');
    }

    const hero = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { id: true, heroName: true, status: true },
    });
    if (!hero) throw new NotFoundException('Hero not found');
    if (hero.status !== 'active') {
      throw new ForbiddenException(`Hero is ${hero.status}`);
    }

    // The grant can never exceed what the venue is licensed for, so a
    // player consenting cannot accidentally widen a partner's reach.
    const granted = [...intersectScopes(venue.scopes)].join(' ');

    const existing = await this.prisma.sourceLink.findFirst({
      where: { rootId, sourceId, status: 'active' },
    });

    let consentCreated = false;
    if (!existing) {
      await this.prisma.sourceLink.create({
        data: {
          rootId,
          sourceId,
          scope: granted,
          // Attribution matters here: this consent was given by the player
          // in the app, not applied on their behalf by an operator.
          grantedBy: `player:${rootId}`,
        },
      });
      consentCreated = true;
      await this.events.log({
        rootId,
        eventType: 'source.link_granted',
        sourceId,
        payload: { source_id: sourceId, scope: granted, granted_by: 'player' },
      });
    }

    const live = await this.prisma.playerSession.findFirst({
      where: { rootId, sourceId, status: 'active' },
      orderBy: { checkedInAt: 'desc' },
    });

    const session =
      live ??
      (await this.prisma.playerSession.create({
        data: { rootId, sourceId, zone: zone ?? null },
      }));

    if (!live) {
      await this.events.log({
        rootId,
        eventType: 'session.check_in',
        sourceId,
        payload: { session_id: session.id, zone: zone ?? null, via: 'player_app' },
      });
    }

    this.logger.log(
      `${hero.heroName} checked in at ${venue.name}` +
        (consentCreated ? ' (consent granted)' : ''),
    );

    return {
      venue: { source_id: venue.id, name: venue.name },
      session_id: session.id,
      checked_in_at: session.checkedInAt.toISOString(),
      consent_granted: consentCreated,
      scope: granted,
      /** True when this hero can now be seated in a run here. */
      ready_to_play: true,
    };
  }

  /**
   * Check out. Deliberately does NOT revoke consent — a player who leaves
   * should not have to re-consent next visit, and revocation belongs in
   * the privacy surface where it can be done deliberately.
   */
  async checkOut(sourceId: string, rootId: string) {
    const live = await this.prisma.playerSession.findFirst({
      where: { rootId, sourceId, status: 'active' },
      orderBy: { checkedInAt: 'desc' },
    });
    if (!live) return { checked_out: false, reason: 'no active session' };

    const endedAt = new Date();
    await this.prisma.playerSession.update({
      where: { id: live.id },
      data: {
        status: 'completed',
        checkedOutAt: endedAt,
        durationSec: Math.round(
          (endedAt.getTime() - live.checkedInAt.getTime()) / 1000,
        ),
      },
    });

    await this.events.log({
      rootId,
      eventType: 'session.check_out',
      sourceId,
      payload: { session_id: live.id, via: 'player_app' },
    });

    return { checked_out: true, session_id: live.id };
  }
}
