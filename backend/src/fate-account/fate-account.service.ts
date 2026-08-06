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
  LinkIdentityDto,
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

    // Password auth has no external subject, so the account's own id is
    // the key. emailVerified stays false — nothing here proves the
    // person registering owns the address they typed.
    await this.prisma.authIdentity.create({
      data: {
        accountId:  account.id,
        provider:   'email',
        providerId: account.id,
        email:      account.email,
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

    // Heal the identity row if it is absent. An account registered
    // between the backfill and this code deploying has none — the old
    // register() knew nothing about the table — and nothing else would
    // ever notice, since login() authenticates on email + hash. Same
    // self-healing shape as the OAuth path.
    await this.prisma.authIdentity.upsert({
      where:  { provider_providerId: { provider: 'email', providerId: account.id } },
      update: { lastUsedAt: new Date() },
      create: {
        accountId:  account.id,
        provider:   'email',
        providerId: account.id,
        email:      account.email,
        // They are signing in right now — a healed row that claims
        // "never used" would be wrong on the settings screen.
        lastUsedAt: new Date(),
      },
    });

    this.logger.log(`Login: ${account.email} (${account.id})`);
    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── GOOGLE OAUTH ─────────────────────────────────────────────────────────────

  /** Verify a Google ID token. Shared by sign-in and linking, so the
   *  two can never drift into checking different things. */
  private async verifyGoogleToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p?.email) throw new Error('Missing sub or email');
      // email_verified is a separate claim from the signature. A token
      // can be perfectly valid and still carry an address Google has
      // never confirmed the holder owns — see findOrCreateOAuthAccount.
      return {
        sub: p.sub,
        email: p.email,
        emailVerified: p.email_verified === true,
        name: p.name as string | undefined,
      };
    } catch (err: any) {
      this.logger.warn(`Google token verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  async googleAuth(dto: GoogleAuthDto) {
    const payload = await this.verifyGoogleToken(dto.id_token);

    const account = await this.findOrCreateOAuthAccount(
      'google',
      payload.sub,
      payload.email,
      payload.emailVerified,
      payload.name,
    );

    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── APPLE OAUTH ──────────────────────────────────────────────────────────────

  /** Verify an Apple identity token. Shared by sign-in and linking. */
  private async verifyAppleToken(identityToken: string) {
    let payload: { sub: string; email?: string; emailVerified: boolean };
    try {
      const decoded = jwt.decode(identityToken, { complete: true });
      if (!decoded?.header?.kid) throw new Error('No kid in Apple token');

      const key = await this.appleJwks.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const verified = jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: process.env.APPLE_CLIENT_ID,
        // Apple sends email_verified as a boolean OR the string 'true'
        // depending on the flow; normalize below rather than trusting
        // either shape.
      }) as { sub: string; email?: string; email_verified?: boolean | string };

      payload = {
        sub:           verified.sub,
        email:         verified.email,
        emailVerified: verified.email_verified === true || verified.email_verified === 'true',
      };
    } catch (err: any) {
      this.logger.warn(`Apple token verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid Apple token');
    }

    // Apple only provides email on first sign-in; afterwards the token
    // carries the sub alone. The synthesized relay address is derived
    // from that sub, so it is exactly as trustworthy as the sub itself
    // — unforgeable, and unique to this user/app pair.
    const synthesized = !payload.email;
    return {
      sub:           payload.sub,
      email:         payload.email ?? `apple.${payload.sub}@privaterelay.appleid.com`,
      emailVerified: synthesized || payload.emailVerified,
    };
  }

  async appleAuth(dto: AppleAuthDto) {
    const payload = await this.verifyAppleToken(dto.identity_token);

    const account = await this.findOrCreateOAuthAccount(
      'apple',
      payload.sub,
      payload.email,
      payload.emailVerified,
      dto.full_name ?? null,
    );

    const session = await this.issueSession(account.id);
    return this.buildAuthResponse(account.id, account.email, session);
  }

  // ── IDENTITY LINKING ─────────────────────────────────────────────────────────
  //
  // The safe half of what the email fallback was doing badly. You are
  // already signed in; you present a provider token; it is attached to
  // the account you are signed in as. No address is consulted, so there
  // is no address to forge.

  async listIdentities(accountId: string) {
    const identities = await this.prisma.authIdentity.findMany({
      where:   { accountId },
      orderBy: { linkedAt: 'asc' },
    });
    return {
      identities: identities.map((i) => ({
        identity_id:    i.id,
        provider:       i.provider,
        email:          i.email,
        email_verified: i.emailVerified,
        linked_at:      i.linkedAt.toISOString(),
        last_used_at:   i.lastUsedAt?.toISOString() ?? null,
        // The email identity is the password, and v1 has no flow for
        // surrendering a password, so the client hides its unlink control.
        can_unlink:     i.provider !== 'email' && identities.length > 1,
      })),
    };
  }

  async linkIdentity(accountId: string, dto: LinkIdentityDto) {
    const wants = [dto.google_id_token && 'google', dto.apple_identity_token && 'apple']
      .filter(Boolean) as Array<'google' | 'apple'>;
    if (wants.length !== 1) {
      throw new BadRequestException('Provide exactly one provider token');
    }
    const provider = wants[0];

    const payload = provider === 'google'
      ? await this.verifyGoogleToken(dto.google_id_token!)
      : await this.verifyAppleToken(dto.apple_identity_token!);

    // Already attached somewhere? Attaching one subject to two accounts
    // would make the sign-in ambiguous, and silently moving it would
    // strand whichever account lost it.
    const existing = await this.prisma.authIdentity.findUnique({
      where: { provider_providerId: { provider, providerId: payload.sub } },
    });
    if (existing) {
      if (existing.accountId === accountId) {
        return { linked: true, provider, already: true };
      }
      throw new ConflictException(
        `That ${provider} account is already linked to a different Heroes account`,
      );
    }

    // Same question against the legacy columns, for any account that has
    // not yet been through the backfill.
    const legacy = await this.prisma.fateAccount.findFirst({
      where: { provider, providerId: payload.sub, NOT: { id: accountId } },
    });
    if (legacy) {
      throw new ConflictException(
        `That ${provider} account is already linked to a different Heroes account`,
      );
    }

    await this.prisma.authIdentity.create({
      data: {
        accountId,
        provider,
        providerId:    payload.sub,
        email:         payload.email.toLowerCase(),
        emailVerified: payload.emailVerified,
      },
    });
    this.logger.log(`Identity linked: ${provider} → account ${accountId}`);
    return { linked: true, provider, already: false };
  }

  async unlinkIdentity(accountId: string, identityId: string) {
    const identity = await this.prisma.authIdentity.findUnique({ where: { id: identityId } });
    if (!identity || identity.accountId !== accountId) {
      throw new NotFoundException('No such identity on this account');
    }

    // Never remove the last way in. An account with no identities is
    // unreachable forever and nothing else in the system would notice.
    const count = await this.prisma.authIdentity.count({ where: { accountId } });
    if (count <= 1) {
      throw new BadRequestException('That is the only way into this account');
    }

    // The 'email' identity IS the password. Removing the row without
    // clearing passwordHash would leave login() working against an
    // identity that no longer exists — so v1 simply refuses, rather than
    // quietly destroying a credential.
    if (identity.provider === 'email') {
      throw new BadRequestException('Email sign-in cannot be unlinked yet');
    }

    await this.prisma.authIdentity.delete({ where: { id: identityId } });

    // Keep the legacy columns honest while they still exist: if they
    // described the identity just removed, they now describe nothing.
    await this.prisma.fateAccount.updateMany({
      where: { id: accountId, provider: identity.provider, providerId: identity.providerId },
      data:  { provider: 'email', providerId: null },
    });

    this.logger.log(`Identity unlinked: ${identity.provider} from account ${accountId}`);
    return { unlinked: true, provider: identity.provider };
  }

  // ── HERO MANAGEMENT ──────────────────────────────────────────────────────────

  /** Permanently delete an account and all associated data. Required
   *  by App Store Review Guideline 5.1.1(v) — any app with account
   *  creation must offer in-app account deletion.
   *
   *  Deleting the FateAccount cascades (onDelete: Cascade) through all
   *  its RootIdentity heroes and every per-hero row (sessions, events,
   *  memoria, gear, IAP records, sanctum state, etc.), plus the account's
   *  own AccountSessions. One delete tears down the whole graph.
   *
   *  NOTE: this is a hard delete. If business/tax retention of IAP
   *  records is ever needed, switch to anonymize-and-retain for the
   *  IapPurchase rows specifically. */
  async deleteAccount(accountId: string): Promise<{ deleted: true }> {
    await this.prisma.fateAccount.delete({ where: { id: accountId } });
    return { deleted: true };
  }

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
          // Sprint 33 — persist Character Creation + Awakening narrative
          // (region/wound/calling/virtue/vice were previously dropped).
          region: dto.region ?? null,
          wound: dto.wound ?? null,
          calling: dto.calling ?? null,
          virtue: dto.virtue ?? null,
          vice: dto.vice ?? null,
          appearance: (dto.appearance as any) ?? undefined,
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
    email: string | null,
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

  /** Resolve the account behind an OAuth sign-in.
   *
   *  `emailVerified` is the provider's own assertion that this user
   *  controls this address — a claim entirely separate from the token
   *  signature, and callers must pass it honestly.
   *
   *  Resolution order is deliberate:
   *    1. auth_identities on (provider, providerId) — the real key
   *    2. the legacy fate_accounts columns, healing the missing row
   *    3. a VERIFIED email match, healing the missing row
   *    4. create
   *
   *  Step 2 exists so this code is safe to deploy before, during, or
   *  after the backfill migration — the app never has to know which. It
   *  goes away with the legacy columns.
   */
  private async findOrCreateOAuthAccount(
    provider: 'google' | 'apple',
    providerId: string,
    email: string,
    emailVerified: boolean,
    displayName?: string | null,
  ) {
    const lowered = email.toLowerCase();

    // 1. The identity table — the only lookup that actually proves who
    //    is signing in.
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { account: true },
    });
    if (identity) {
      // Check before writing: a suspended account should not have its
      // sign-in timestamps updated by an attempt that gets refused.
      this.assertActive(identity.account);
      await this.touchIdentity(identity.id, identity.accountId);
      return identity.account;
    }

    // 2. Legacy columns. An account that predates the backfill — or one
    //    created between deploy and migration — still signs in, and
    //    gains its identity row on the way through.
    let account = await this.prisma.fateAccount.findFirst({
      where: { provider, providerId },
    });

    // 3. Email fallback. This is how an existing email/password player
    //    reaches their heroes the first time they use a provider, and it
    //    is the reason linking exists — once linking ships this whole
    //    branch goes (see docs/google-launch-plan.md § 0). It MUST NOT
    //    run on an address the provider has not confirmed: a
    //    validly-signed token asserting someone else's address would
    //    otherwise hand over whatever account holds it, heroes and all.
    if (!account) {
      if (emailVerified) {
        account = await this.prisma.fateAccount.findUnique({ where: { email: lowered } });
      } else {
        this.logger.warn(
          `${provider} sign-in with unverified email — creating a separate ` +
          `account rather than matching ${lowered}`,
        );
      }
    }

    // 4. Nobody matched: a genuinely new player.
    if (!account) {
      account = await this.prisma.fateAccount.create({
        data: { email: lowered, provider, providerId, displayName: displayName ?? null },
      });
      this.logger.log(`OAuth account created: ${lowered} via ${provider} (${account.id})`);
    } else {
      await this.prisma.fateAccount.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      });
    }

    this.assertActive(account);

    // Record the identity however we got here, so the next sign-in
    // resolves at step 1 and never consults an address again. This also
    // retires the old `provider`-column promotion: the identity row does
    // that job properly, so an email/password account matched at step 3
    // keeps its honest `provider = 'email'` label.
    await this.prisma.authIdentity.upsert({
      where:  { provider_providerId: { provider, providerId } },
      update: { lastUsedAt: new Date() },
      create: {
        accountId: account.id,
        provider,
        providerId,
        email: lowered,
        emailVerified,
        lastUsedAt: new Date(),
      },
    });

    return account;
  }

  /** A suspended account must not receive a session by any route. */
  private assertActive<T extends { status: string }>(account: T): T {
    if (account.status !== 'active') {
      throw new UnauthorizedException('Account is suspended');
    }
    return account;
  }

  private async touchIdentity(identityId: string, accountId: string) {
    const now = new Date();
    await Promise.all([
      this.prisma.authIdentity.update({
        where: { id: identityId },
        data: { lastUsedAt: now },
      }),
      this.prisma.fateAccount.update({
        where: { id: accountId },
        data: { lastLoginAt: now },
      }),
    ]);
  }

  private formatHero(hero: any) {
    return {
      root_id: hero.id,
      hero_name: hero.heroName,
      fate_alignment: hero.fateAlignment,
      fate_level: hero.fateLevel,
      fate_xp: hero.fateXp,
      origin: hero.origin,
      appearance: hero.appearance ?? null,
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
