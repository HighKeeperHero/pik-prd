// ============================================================
// PIK — Key Service
// Key Rotation + Revocation (SimpleWebAuthn v10)
// Place at: src/auth/key.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EventsService } from '../events/events.service';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);

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

  // ── LIST KEYS ─────────────────────────────────────────────

  async listKeys(rootId: string) {
    const keys = await this.prisma.authKey.findMany({
      where: { rootId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        credentialId: true,
        deviceType: true,
        backedUp: true,
        transports: true,
        friendlyName: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });

    return keys.map((k) => ({
      key_id: k.id,
      credential_id: k.credentialId,
      device_type: k.deviceType,
      backed_up: k.backedUp,
      transports: k.transports,
      friendly_name: k.friendlyName,
      status: k.status,
      created_at: k.createdAt.toISOString(),
      revoked_at: k.revokedAt?.toISOString() ?? null,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
    }));
  }

  // ── ROTATION — Step 1: Generate Options ───────────────────

  async generateRotationOptions(rootId: string) {
    const existingKeys = await this.prisma.authKey.findMany({
      where: { rootId, status: 'active' },
      select: { credentialId: true, transports: true },
    });

    const user = await this.prisma.rootIdentity.findUnique({
      where: { id: rootId },
      select: { heroName: true },
    });

    if (!user) {
      throw new NotFoundException(`Identity not found: ${rootId}`);
    }

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: user.heroName,
      userDisplayName: user.heroName,
      excludeCredentials: existingKeys.map((k) => ({
        id: k.credentialId,
        transports: k.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestationType: 'none',
    });

    await this.prisma.webAuthnChallenge.create({
      data: {
        rootId,
        challenge: options.challenge,
        type: 'registration',
        metadata: { purpose: 'key_rotation' } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    this.logger.debug(`Key rotation challenge generated for ${rootId}`);
    return options;
  }

  // ── ROTATION — Step 2: Verify and Store ───────────────────

  async verifyRotation(
    rootId: string,
    attestation: Record<string, unknown>,
    friendlyName?: string,
  ) {
    const response = attestation as unknown as RegistrationResponseJSON;

    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
    );

    const challengeRecord = await this.prisma.webAuthnChallenge.findUnique({
      where: { challenge: clientData.challenge },
    });

    if (!challengeRecord) {
      throw new BadRequestException('Unknown or already-used challenge');
    }
    if (challengeRecord.rootId !== rootId) {
      throw new BadRequestException('Challenge does not belong to this identity');
    }
    if (challengeRecord.expiresAt < new Date()) {
      await this.prisma.webAuthnChallenge.delete({ where: { id: challengeRecord.id } });
      throw new BadRequestException('Challenge has expired');
    }

    await this.prisma.webAuthnChallenge.delete({ where: { id: challengeRecord.id } });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.rpOrigin,
        expectedRPID: this.rpId,
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Key rotation verification failed: ${error.message}`,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Key rotation verification failed');
    }

    // SimpleWebAuthn v10: properties are flat on registrationInfo
    const {
      credentialID,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const authKey = await this.prisma.authKey.create({
      data: {
        rootId,
        credentialId: credentialID,
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: (response.response.transports as string[]) ?? [],
        friendlyName: friendlyName ?? null,
      },
    });

    await this.events.log({
      rootId,
      eventType: 'key.registered',
      payload: {
        key_id: authKey.id,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        friendly_name: friendlyName ?? null,
        purpose: 'rotation',
      },
    });

    this.logger.log(`Key rotated: new key ${authKey.id} for ${rootId}`);

    return {
      key_id: authKey.id,
      device_type: authKey.deviceType,
      backed_up: authKey.backedUp,
      friendly_name: authKey.friendlyName,
      created_at: authKey.createdAt.toISOString(),
    };
  }

  // ── REVOCATION ────────────────────────────────────────────

  async revokeKey(rootId: string, keyId: string) {
    const key = await this.prisma.authKey.findFirst({
      where: { id: keyId, rootId },
    });

    if (!key) {
      throw new NotFoundException(
        `Key not found: ${keyId} for identity ${rootId}`,
      );
    }
    if (key.status === 'revoked') {
      throw new ConflictException('Key is already revoked');
    }

    const activeKeyCount = await this.prisma.authKey.count({
      where: { rootId, status: 'active' },
    });

    if (activeKeyCount <= 1) {
      throw new ConflictException(
        'Cannot revoke the last active key. Register a new key first.',
      );
    }

    await this.prisma.authKey.update({
      where: { id: keyId },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    await this.events.log({
      rootId,
      eventType: 'key.revoked',
      payload: {
        key_id: keyId,
        device_type: key.deviceType,
        friendly_name: key.friendlyName,
      },
    });

    this.logger.log(`Key revoked: ${keyId} for ${rootId}`);

    return {
      key_id: keyId,
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    };
  }
}
