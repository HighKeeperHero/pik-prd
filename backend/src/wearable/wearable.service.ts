// ============================================================
// PIK — Wearable Service (Sprint 7.2 — Wearable Bridge)
//
// Maps physical tokens (wristbands, RFID, NFC) to root
// identities. The core API contract for venue hardware:
//
//   tap token_uid → resolve identity → authorize session
//
// No actual RFID hardware needed — the API contract is what
// matters. Demo simulates the tap flow end-to-end.
//
// Place at: src/wearable/wearable.service.ts
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { SseService } from '../sse/sse.service';
import { SessionService } from '../session/session.service';
import * as crypto from 'crypto';

@Injectable()
export class WearableService {
  private readonly logger = new Logger(WearableService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sse: SseService,
    private readonly sessions: SessionService,
  ) {}

  // ── ISSUE TOKEN ──────────────────────────────────────────

  async issueToken(params: {
    rootId: string;
    tokenType: string;
    tokenUid?: string;
    friendlyName?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    // Validate token type
    const validTypes = ['wristband', 'rfid_card', 'nfc_tag', 'qr_badge'];
    if (!validTypes.includes(params.tokenType)) {
      throw new BadRequestException(
        `Invalid token type: ${params.tokenType}. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    // Verify user exists
    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: params.rootId },
      select: { id: true, heroName: true, status: true },
    });
    if (!user) throw new NotFoundException(`Identity not found: ${params.rootId}`);
    if (user.status !== 'active') throw new BadRequestException(`Identity is ${user.status}`);

    // Generate a token UID if not provided
    const tokenUid = params.tokenUid || this.generateTokenUid(params.tokenType);

    // Check for duplicate UID
    const existing = await this.prisma.identityToken.findUnique({
      where: { tokenUid },
    });
    if (existing) {
      throw new ConflictException(`Token UID already in use: ${tokenUid}`);
    }

    // Create the token
    const token = await this.prisma.identityToken.create({
      data: {
        rootId: params.rootId,
        tokenType: params.tokenType,
        tokenUid,
        friendlyName: params.friendlyName || this.generateFriendlyName(params.tokenType, tokenUid),
        expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
        metadata: params.metadata || null,
      },
    });

    // Log event
    await this.events.log({
      rootId: params.rootId,
      eventType: 'wearable.issued',
      payload: {
        token_id: token.id,
        token_type: params.tokenType,
        token_uid: tokenUid,
        friendly_name: token.friendlyName,
        hero_name: user.heroName,
      },
    });

    this.logger.log(`Wearable issued: ${token.friendlyName} → ${user.heroName}`);

    return {
      token_id: token.id,
      root_id: params.rootId,
      token_type: params.tokenType,
      token_uid: tokenUid,
      friendly_name: token.friendlyName,
      status: 'active',
      issued_at: token.issuedAt.toISOString(),
    };
  }

  // ── RESOLVE / TAP ────────────────────────────────────────

  async resolve(params: {
    tokenUid: string;
    sourceId?: string;
    zone?: string;
    autoCheckin?: boolean;
  }) {
    // Look up token
    const token = await this.prisma.identityToken.findUnique({
      where: { tokenUid: params.tokenUid },
      include: {
        root: {
          select: {
            id: true,
            heroName: true,
            fateAlignment: true,
            fateLevel: true,
            fateXp: true,
            status: true,
            equippedTitle: true,
          },
        },
      },
    });

    if (!token) {
      throw new NotFoundException(`Unknown token: ${params.tokenUid}`);
    }

    if (token.status !== 'active') {
      throw new BadRequestException(`Token is ${token.status}`);
    }

    if (token.expiresAt && token.expiresAt < new Date()) {
      // Auto-expire
      await this.prisma.identityToken.update({
        where: { id: token.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Token has expired');
    }

    if (token.root.status !== 'active') {
      throw new BadRequestException(`Identity is ${token.root.status}`);
    }

    // Update tap stats
    await this.prisma.identityToken.update({
      where: { id: token.id },
      data: {
        lastTapAt: new Date(),
        tapCount: { increment: 1 },
      },
    });

    // Log the tap event
    await this.events.log({
      rootId: token.rootId,
      eventType: 'wearable.tap',
      sourceId: params.sourceId || null,
      payload: {
        token_id: token.id,
        token_uid: params.tokenUid,
        token_type: token.tokenType,
        hero_name: token.root.heroName,
        fate_level: token.root.fateLevel,
        source_id: params.sourceId || null,
        zone: params.zone || null,
        auto_checkin: params.autoCheckin || false,
      },
    });

    this.logger.log(
      `Wearable tap: ${token.friendlyName} → ${token.root.heroName} (Lv${token.root.fateLevel})`,
    );

    // Build resolved identity response
    const identity = {
      root_id: token.root.id,
      hero_name: token.root.heroName,
      fate_alignment: token.root.fateAlignment,
      fate_level: token.root.fateLevel,
      fate_xp: token.root.fateXp,
      equipped_title: token.root.equippedTitle,
      token_id: token.id,
      token_type: token.tokenType,
      friendly_name: token.friendlyName,
      tap_count: token.tapCount + 1,
    };

    // Auto check-in if requested
    let session = null;
    if (params.autoCheckin && params.sourceId) {
      try {
        session = await this.sessions.checkIn({
          rootId: token.rootId,
          sourceId: params.sourceId,
          zone: params.zone,
        });
      } catch (err) {
        // Don't fail the resolve if check-in fails (e.g., already checked in)
        this.logger.warn(`Auto check-in failed after tap: ${err.message}`);
        session = { error: err.message };
      }
    }

    return {
      resolved: true,
      identity,
      session: session || null,
    };
  }

  // ── REVOKE ───────────────────────────────────────────────

  async revokeToken(tokenId: string) {
    const token = await this.prisma.identityToken.findUnique({
      where: { id: tokenId },
      include: { root: { select: { heroName: true } } },
    });
    if (!token) throw new NotFoundException(`Token not found: ${tokenId}`);

    await this.prisma.identityToken.update({
      where: { id: tokenId },
      data: { status: 'revoked' },
    });

    await this.events.log({
      rootId: token.rootId,
      eventType: 'wearable.revoked',
      payload: {
        token_id: tokenId,
        token_uid: token.tokenUid,
        friendly_name: token.friendlyName,
        hero_name: token.root.heroName,
      },
    });

    this.logger.log(`Wearable revoked: ${token.friendlyName}`);

    return { token_id: tokenId, status: 'revoked' };
  }

  // ── QUERIES ──────────────────────────────────────────────

  async getTokensForPlayer(rootId: string) {
    const tokens = await this.prisma.identityToken.findMany({
      where: { rootId },
      orderBy: { issuedAt: 'desc' },
    });
    return tokens.map((t) => ({
      token_id: t.id,
      token_type: t.tokenType,
      token_uid: t.tokenUid,
      friendly_name: t.friendlyName,
      status: t.status,
      issued_at: t.issuedAt.toISOString(),
      expires_at: t.expiresAt?.toISOString() ?? null,
      last_tap_at: t.lastTapAt?.toISOString() ?? null,
      tap_count: t.tapCount,
    }));
  }

  async getAllActiveTokens() {
    const tokens = await this.prisma.identityToken.findMany({
      where: { status: 'active' },
      include: { root: { select: { heroName: true, fateLevel: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return tokens.map((t) => ({
      token_id: t.id,
      root_id: t.rootId,
      hero_name: t.root.heroName,
      fate_level: t.root.fateLevel,
      token_type: t.tokenType,
      token_uid: t.tokenUid,
      friendly_name: t.friendlyName,
      last_tap_at: t.lastTapAt?.toISOString() ?? null,
      tap_count: t.tapCount,
    }));
  }

  // ── HELPERS ──────────────────────────────────────────────

  private generateTokenUid(tokenType: string): string {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const prefixes: Record<string, string> = {
      wristband: 'PIK-BAND',
      rfid_card: 'PIK-RFID',
      nfc_tag: 'PIK-NFC',
      qr_badge: 'PIK-QR',
    };
    return `${prefixes[tokenType] || 'PIK'}-${hex}`;
  }

  private generateFriendlyName(tokenType: string, tokenUid: string): string {
    const suffix = tokenUid.split('-').pop() || '';
    const names: Record<string, string> = {
      wristband: `Fate Band #${suffix}`,
      rfid_card: `RFID Card #${suffix}`,
      nfc_tag: `NFC Tag #${suffix}`,
      qr_badge: `Badge #${suffix}`,
    };
    return names[tokenType] || `Token #${suffix}`;
  }
}
