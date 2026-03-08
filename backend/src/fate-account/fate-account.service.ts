// src/fate-account/fate-account.service.ts
// ============================================================
// Sprint 6A — FateAccount auth layer
// Supports: email+password, Google OAuth, Apple OAuth
// Hero management: create (max 2), list, select, alignment
// ============================================================

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { PrismaService } from '../prisma.service';
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  AppleAuthDto,
  CreateHeroDto,
  UpdateHeroAlignmentDto,
} from './dto/auth.dto';

const BCRYPT_ROUNDS  = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HERO_LIMIT     = 2;

const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER   = 'https://appleid.apple.com';

@Injectable()
export class FateAccountService {
  private readonly logger = new Logger(FateAccountService.name);
  private readonly googleClient: OAuth2Client;
  private readonly appleJwks: jwksClient.JwksClient;

  constructor(private readonly prisma: PrismaService) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    this.appleJwks = jwksClient({
      jwksUri: APPLE_JWKS_URI,
      cache: true,
      cacheMaxAge: 60 * 60 * 1000, // 1 hour
    });
  }

  // ── REGISTER (email + password) ──────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.fateAccount.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const account = await this.prisma.fateAccount.create({
      data: {
        email: dto.email.toLowerCase(),
        provider: 'email',
        passwordHash,
        displayName: dto.display_name ?? null,
      },
    });

    this.logger.log(`Registered: ${account.email} (${account.id})`);
    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── LOGIN (email + password) ─────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const account = await this.prisma.fateAccount.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!account || !account.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (account.status !== 'active') {
      throw new UnauthorizedException('Account is suspended');
    }

    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    await this.prisma.fateAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Login: ${account.email} (${account.id})`);
    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── GOOGLE OAUTH ─────────────────────────────────────────────────────────────

  async googleAuth(dto: GoogleAuthDto) {
    let payload: { sub: string; email: string; name?: string };
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p?.email) throw new Error('Missing sub or email');
      payload = { sub: p.sub, email: p.email, name: p.name };
    } catch (err: any) {
      this.logger.warn(`Google token verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    const account = await this.findOrCreateOAuthAccount(
      'google',
      payload.sub,
      payload.email,
      payload.name,
    );

    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── APPLE OAUTH ──────────────────────────────────────────────────────────────

  async appleAuth(dto: AppleAuthDto) {
    let payload: { sub: string; email?: string };
    try {
      const decoded = jwt.decode(dto.identity_token, { complete: true });
      if (!decoded?.header?.kid) throw new Error('No kid in Apple token');

      const key = await this.appleJwks.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const verified = jwt.verify(dto.identity_token, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: process.env.APPLE_CLIENT_ID,
      }) as { sub: string; email?: string };

      payload = { sub: verified.sub, email: verified.email };
    } catch (err: any) {
      this.logger.warn(`Apple token verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid Apple token');
    }

    // Apple only provides email on first sign-in
    const email = payload.email ?? `apple.${payload.sub}@privaterelay.appleid.com`;

    const account = await this.findOrCreateOAuthAccount(
      'apple',
      payload.sub,
      email,
      dto.full_name ?? null,
    );

    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── HERO MANAGEMENT ──────────────────────────────────────────────────────────

  async listHeroes(accountId: string) {
    const heroes = await this.prisma.rootIdentity.findMany({
      where: { fateAccountId: accountId, status: 'active' },
      orderBy: { enrolledAt: 'asc' },
      include: {
        titles: { include: { title: true } },
      },
    });

    return heroes.map(h => this.formatHero(h));
  }

  async createHero(accountId: string, dto: CreateHeroDto) {
    // Enforce hero limit
    const count = await this.prisma.rootIdentity.count({
      where: { fateAccountId: accountId, status: 'active' },
    });
    if (count >= HERO_LIMIT) {
      throw new BadRequestException(`Maximum ${HERO_LIMIT} heroes per account`);
    }

    // Check name uniqueness
    const existing = await this.prisma.rootIdentity.findUnique({
      where: { heroName: dto.hero_name },
    });
    if (existing) throw new ConflictException('Hero name is already taken');

    const hero = await this.prisma.$transaction(async (tx) => {
      const root = await tx.rootIdentity.create({
        data: {
          fateAccountId: accountId,
          heroName: dto.hero_name,
          fateAlignment: 'NONE',
          origin: dto.origin ?? null,
          enrolledBy: 'self:codex-pwa',
        },
      });

    await tx.sourceLink.create({
      data: {
       rootId: root.id,
       sourceId: 'src-heroes-veritas-01',
       grantedBy: 'self:codex-pwa',
      },
    });

      await tx.identityEvent.create({
        data: {
          rootId: root.id,
          eventType: 'identity.enrolled',
          payload: {
            enrolled_by: 'self:codex-pwa',
            hero_name: dto.hero_name,
            auth_method: 'fate_account',
          },
        },
      });

      return root;
    });

    this.logger.log(`Hero created: ${dto.hero_name} (${hero.id}) under account ${accountId}`);
    return this.formatHero(hero);
  }

  async selectHero(accountId: string, heroId: string, sessionToken: string) {
    // Verify hero belongs to this account
    const hero = await this.prisma.rootIdentity.findFirst({
      where: { id: heroId, fateAccountId: accountId, status: 'active' },
    });
    if (!hero) throw new NotFoundException('Hero not found');

    // Update session with selected hero
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    await this.prisma.accountSession.updateMany({
      where: { tokenHash, accountId },
      data: { selectedHeroId: heroId },
    });

    this.logger.log(`Hero selected: ${hero.heroName} (${heroId}) for account ${accountId}`);
    return this.formatHero(hero);
  }

  async updateAlignment(accountId: string, heroId: string, alignment: string) {
    const validAlignments = ['ORDER', 'CHAOS', 'LIGHT', 'DARK'];
    if (!validAlignments.includes(alignment)) {
      throw new BadRequestException(`Invalid alignment. Must be one of: ${validAlignments.join(', ')}`);
    }

    const hero = await this.prisma.rootIdentity.findFirst({
      where: { id: heroId, fateAccountId: accountId, status: 'active' },
    });
    if (!hero) throw new NotFoundException('Hero not found');

    if (hero.fateLevel < 20) {
      throw new BadRequestException('Alignment requires Fate Level 20');
    }

    const updated = await this.prisma.rootIdentity.update({
      where: { id: heroId },
      data: { fateAlignment: alignment },
    });

    await this.prisma.identityEvent.create({
      data: {
        rootId: heroId,
        eventType: 'identity.alignment_chosen',
        payload: { alignment, previous: hero.fateAlignment },
      },
    });

    return this.formatHero(updated);
  }

  // ── SESSION MANAGEMENT ────────────────────────────────────────────────────────

  async validateSession(rawToken: string): Promise<{
    accountId: string;
    heroId: string | null;
  } | null> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const session = await this.prisma.accountSession.findUnique({
      where: { tokenHash },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    return {
      accountId: session.accountId,
      heroId: session.selectedHeroId ?? null,
    };
  }

  async revokeSession(rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.accountSession.deleteMany({ where: { tokenHash } });
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────────

  private async issueSession(accountId: string) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.accountSession.create({
      data: { accountId, tokenHash, expiresAt },
    });

    return { token: rawToken, expiresAt: expiresAt.toISOString() };
  }

  private async buildAuthResponse(
    accountId: string,
    email: string,
    session: { token: string; expiresAt: string },
  ) {
    const heroes = await this.listHeroes(accountId);
    return {
      account_id: accountId,
      email,
      session_token: session.token,
      session_expires_at: session.expiresAt,
      heroes,
    };
  }

  private async findOrCreateOAuthAccount(
    provider: 'google' | 'apple',
    providerId: string,
    email: string,
    displayName?: string | null,
  ) {
    // First try to find by provider + providerId (most reliable)
    let account = await this.prisma.fateAccount.findFirst({
      where: { provider, providerId },
    });

    // Fall back to email match (handles edge cases)
    if (!account) {
      account = await this.prisma.fateAccount.findUnique({
        where: { email: email.toLowerCase() },
      });
    }

    if (account) {
      // Update providerId if missing (email-matched account being upgraded to OAuth)
      if (!account.providerId) {
        account = await this.prisma.fateAccount.update({
          where: { id: account.id },
          data: { providerId, provider, lastLoginAt: new Date() },
        });
      } else {
        await this.prisma.fateAccount.update({
          where: { id: account.id },
          data: { lastLoginAt: new Date() },
        });
      }
    } else {
      account = await this.prisma.fateAccount.create({
        data: {
          email: email.toLowerCase(),
          provider,
          providerId,
          displayName: displayName ?? null,
        },
      });
      this.logger.log(`OAuth account created: ${email} via ${provider} (${account.id})`);
    }

    if (account.status !== 'active') {
      throw new UnauthorizedException('Account is suspended');
    }

    return account;
  }

  private formatHero(hero: any) {
    return {
      root_id: hero.id,
      hero_name: hero.heroName,
      fate_alignment: hero.fateAlignment,
      fate_level: hero.fateLevel,
      fate_xp: hero.fateXp,
      origin: hero.origin,
      enrolled_at: hero.enrolledAt?.toISOString(),
      equipped_title: hero.equippedTitle ?? null,
      titles: (hero.titles ?? []).map((ut: any) => ({
        title_id: ut.titleId,
        title_name: ut.title?.displayName,
        category: ut.title?.category,
        granted_at: ut.grantedAt?.toISOString(),
      })),
    };
  }
}
