// ============================================================
// PIK — Auth Service
// WebAuthn Registration + Authentication (SimpleWebAuthn v10)
// Place at: src/auth/auth.service.ts
// ============================================================

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { createHash, randomBytes } from 'crypto';
import { Prisma, SourceLink } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';
import { RegisterOptionsDto } from './dto/register.dto';
import { AuthenticateOptionsDto } from './dto/authenticate.dto';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly rpName: string;
  private readonly rpId: string;
  private readonly rpOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {
    this.rpName = process.env.WEBAUTHN_RP_NAME || 'PIK - Persistent Identity Kernel';
    this.rpId = process.env.WEBAUTHN_RP_ID || 'localhost';
    this.rpOrigin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:8080';
  }

  // ── REGISTRATION — Step 1: Generate Options ───────────────

  async generateRegistrationOptions(dto: RegisterOptionsDto) {
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: dto.hero_name,
      userDisplayName: dto.hero_name,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestationType: 'none',
    });

    await this.prisma.webAuthnChallenge.create({
      data: {
        challenge: options.challenge,
        type: 'registration',
        metadata: {
          hero_name: dto.hero_name,
          fate_alignment: dto.fate_alignment,
          origin: dto.origin ?? null,
          enrolled_by: dto.enrolled_by ?? 'self',
          source_id: dto.source_id ?? null,
          user_id: options.user.id,
        } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    this.logger.debug(`Registration challenge generated for ${dto.hero_name}`);
    return options;
  }

  // ── REGISTRATION — Step 2: Verify Attestation ─────────────

  async verifyRegistration(
    attestation: Record<string, unknown>,
    friendlyName?: string,
  ) {
    const response = attestation as unknown as RegistrationResponseJSON;

    const challengeRecord = await this.findAndConsumeChallenge(
      response.response.clientDataJSON,
      'registration',
    );

    const metadata = challengeRecord.metadata as Record<string, unknown>;

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.rpOrigin,
        expectedRPID: this.rpId,
      });
    } catch (error: any) {
      this.logger.warn(`Registration verification failed: ${error.message}`);
      throw new BadRequestException(
        `Registration verification failed: ${error.message}`,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Registration verification failed');
    }

    // SimpleWebAuthn v10: properties are flat on registrationInfo
    const {
      credentialID,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const result = await this.prisma.$transaction(async (tx) => {
      const root = await tx.rootIdentity.create({
        data: {
          heroName: metadata.hero_name as string,
          fateAlignment: metadata.fate_alignment as string,
          origin: (metadata.origin as string) ?? null,
          enrolledBy: (metadata.enrolled_by as string) ?? 'self',
        },
      });

      const persona = await tx.persona.create({
        data: {
          rootId: root.id,
          displayName: metadata.hero_name as string,
        },
      });

      const authKey = await tx.authKey.create({
        data: {
          rootId: root.id,
          credentialId: credentialID,
          publicKey: Buffer.from(credentialPublicKey),
          counter: BigInt(counter),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          transports: (response.response.transports as string[]) ?? [],
          friendlyName: friendlyName ?? null,
        },
      });

      let link: SourceLink | null = null;
      if (metadata.source_id) {
        const source = await tx.source.findUnique({
          where: { id: metadata.source_id as string },
        });
        if (source && source.status === 'active') {
          link = await tx.sourceLink.create({
            data: {
              rootId: root.id,
              sourceId: source.id,
              grantedBy: (metadata.enrolled_by as string) ?? 'self',
            },
          });
        }
      }

      await tx.identityEvent.create({
        data: {
          rootId: root.id,
          eventType: 'identity.enrolled',
          payload: {
            enrolled_by: (metadata.enrolled_by as string) ?? 'self',
            hero_name: metadata.hero_name as string,
            auth_method: 'webauthn',
          } as Prisma.InputJsonValue,
        },
      });

      await tx.identityEvent.create({
        data: {
          rootId: root.id,
          eventType: 'key.registered',
          payload: {
            key_id: authKey.id,
            device_type: credentialDeviceType,
            backed_up: credentialBackedUp,
            friendly_name: friendlyName ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      if (link) {
        await tx.identityEvent.create({
          data: {
            rootId: root.id,
            eventType: 'source.link_granted',
            sourceId: metadata.source_id as string,
            payload: {
              link_id: link.id,
              source_id: metadata.source_id as string,
              granted_by: (metadata.enrolled_by as string) ?? 'self',
            } as Prisma.InputJsonValue,
          },
        });
      }

      return { root, persona, authKey, link };
    });

    const session = await this.issueSessionToken(result.root.id);

    this.logger.log(
      `Registered: ${metadata.hero_name} (${result.root.id}) via WebAuthn`,
    );

    return {
      root_id: result.root.id,
      persona_id: result.persona.id,
      hero_name: result.root.heroName,
      fate_alignment: result.root.fateAlignment,
      key_id: result.authKey.id,
      ...(result.link ? { link_id: result.link.id } : {}),
      enrolled_at: result.root.enrolledAt.toISOString(),
      session_token: session.token,
      session_expires_at: session.expiresAt,
    };
  }

  // ── AUTHENTICATION — Step 1: Generate Options ─────────────

  async generateAuthenticationOptions(dto: AuthenticateOptionsDto) {
    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

    if (dto.root_id) {
      const keys = await this.prisma.authKey.findMany({
        where: { rootId: dto.root_id, status: 'active' },
        select: { credentialId: true, transports: true },
      });

      if (keys.length === 0) {
        throw new BadRequestException(
          'No active credentials found for this identity',
        );
      }

      allowCredentials = keys.map((k) => ({
        id: k.credentialId,
        transports: k.transports as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials,
      userVerification: 'preferred',
    });

    await this.prisma.webAuthnChallenge.create({
      data: {
        rootId: dto.root_id ?? null,
        challenge: options.challenge,
        type: 'authentication',
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    this.logger.debug(
      `Authentication challenge generated` +
        (dto.root_id ? ` for ${dto.root_id}` : ' (discoverable)'),
    );

    return options;
  }

  // ── AUTHENTICATION — Step 2: Verify Assertion ─────────────

  async verifyAuthentication(assertion: Record<string, unknown>) {
    const response = assertion as unknown as AuthenticationResponseJSON;

    const authKey = await this.prisma.authKey.findUnique({
      where: { credentialId: response.id },
      include: {
        root: { select: { id: true, heroName: true, status: true } },
      },
    });

    if (!authKey) {
      throw new UnauthorizedException('Unknown credential');
    }
    if (authKey.status !== 'active') {
      throw new UnauthorizedException('Credential has been revoked');
    }
    if (authKey.root.status !== 'active') {
      throw new UnauthorizedException('Identity is suspended or deleted');
    }

    const challengeRecord = await this.findAndConsumeChallenge(
      response.response.clientDataJSON,
      'authentication',
    );

    let verification;
    try {
      // SimpleWebAuthn v10: uses `authenticator` not `credential`
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.rpOrigin,
        expectedRPID: this.rpId,
        authenticator: {
          credentialID: authKey.credentialId,
          credentialPublicKey: new Uint8Array(authKey.publicKey),
          counter: Number(authKey.counter),
          transports: authKey.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Authentication verification failed for ${authKey.rootId}: ${error.message}`,
      );
      throw new UnauthorizedException(
        `Authentication verification failed: ${error.message}`,
      );
    }

    if (!verification.verified) {
      throw new UnauthorizedException('Authentication verification failed');
    }

    await this.prisma.authKey.update({
      where: { id: authKey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    await this.events.log({
      rootId: authKey.rootId,
      eventType: 'identity.authenticated',
      payload: {
        key_id: authKey.id,
        device_type: authKey.deviceType,
      },
    });

    const session = await this.issueSessionToken(authKey.rootId);

    this.logger.log(
      `Authenticated: ${authKey.root.heroName} (${authKey.rootId})`,
    );

    return {
      root_id: authKey.rootId,
      hero_name: authKey.root.heroName,
      key_id: authKey.id,
      session_token: session.token,
      session_expires_at: session.expiresAt,
    };
  }

  // ── SESSION TOKENS ────────────────────────────────────────

  async issueSessionToken(
    rootId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const ttlConfig = await this.prisma.config.findUnique({
      where: { key: 'pik.session_token_ttl_secs' },
    });
    const ttlSecs = parseInt(ttlConfig?.value ?? '3600', 10);
    const expiresAt = new Date(Date.now() + ttlSecs * 1000);

    await this.prisma.sessionToken.create({
      data: { rootId, tokenHash, expiresAt },
    });

    return { token: rawToken, expiresAt: expiresAt.toISOString() };
  }

  async validateSessionToken(token: string): Promise<string | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.sessionToken.findUnique({
      where: { tokenHash },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    return session.rootId;
  }

  // ── HELPERS ───────────────────────────────────────────────

  private async findAndConsumeChallenge(
    clientDataJSON: string,
    expectedType: 'registration' | 'authentication',
  ) {
    const clientData = JSON.parse(
      Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
    );
    const challenge = clientData.challenge;

    if (!challenge) {
      throw new BadRequestException('No challenge found in client data');
    }

    const record = await this.prisma.webAuthnChallenge.findUnique({
      where: { challenge },
    });

    if (!record) {
      throw new BadRequestException('Unknown or already-used challenge');
    }
    if (record.type !== expectedType) {
      throw new BadRequestException(
        `Challenge type mismatch: expected ${expectedType}, got ${record.type}`,
      );
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.webAuthnChallenge.delete({ where: { id: record.id } });
      throw new BadRequestException('Challenge has expired');
    }

    await this.prisma.webAuthnChallenge.delete({ where: { id: record.id } });
    return record;
  }
}
