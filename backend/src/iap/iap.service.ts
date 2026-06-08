// ============================================================
// PIK — IAP Service
//
// Verifies a StoreKit 2 signed transaction from the iOS client,
// dedups by Apple's transactionId, and credits Veil Essence on
// the hero's sanctum_state row. The whole flow is wrapped in a
// Prisma transaction so we never half-credit.
//
// v1.0 scope: consumable currency only. Subscriptions, refund
// webhooks (Server Notifications V2), and the merchant-info /
// receipt-bundle flow are post-v1.0.
// ============================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ESSENCE_BY_SKU, APPLE_BUNDLE_ID, APPLE_APP_APPLE_ID } from './skus';
import { GooglePlayVerifier } from './google-play.verifier';
import {
  SignedDataVerifier,
  Environment,
  JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class IapService implements OnModuleInit {
  private readonly logger = new Logger(IapService.name);
  private prodVerifier!:    SignedDataVerifier;
  private sandboxVerifier!: SignedDataVerifier;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GooglePlayVerifier,
  ) {}

  onModuleInit() {
    const certsDir = path.join(__dirname, 'certs');
    const appleRootCerts = [
      'AppleRootCA-G3.cer',
      'AppleRootCA-G2.cer',
      'AppleIncRootCertificate.cer',
    ].map((f) => fs.readFileSync(path.join(certsDir, f)));

    // One verifier per environment. We try production first; if
    // the signed payload's environment claim is Sandbox the verify
    // call will reject and we fall back. Apple recommends this
    // pattern for any app that can receive either kind of payload.
    this.prodVerifier = new SignedDataVerifier(
      appleRootCerts,
      /* enableOnlineChecks */ false,
      Environment.PRODUCTION,
      APPLE_BUNDLE_ID,
      APPLE_APP_APPLE_ID,
    );
    this.sandboxVerifier = new SignedDataVerifier(
      appleRootCerts,
      /* enableOnlineChecks */ false,
      Environment.SANDBOX,
      APPLE_BUNDLE_ID,
      APPLE_APP_APPLE_ID,
    );
    this.logger.log('Apple receipt verifiers ready (prod + sandbox).');
  }

  /** Platform dispatcher. iOS sends a StoreKit JWS; Android sends a
   *  Play purchase token + productId. */
  async redeem(
    rootId: string,
    dto: { signedTransaction: string; platform?: string; productId?: string },
  ) {
    if (dto.platform === 'android') {
      return this.redeemAndroid(rootId, dto.signedTransaction, dto.productId);
    }
    return this.redeemApple(rootId, dto.signedTransaction);
  }

  /** iOS StoreKit 2 redemption. */
  private async redeemApple(rootId: string, signedTransaction: string) {
    const decoded = await this.verify(signedTransaction);

    if (!decoded.productId) {
      throw new BadRequestException('Transaction has no productId.');
    }
    const sku = decoded.productId;
    const essence = ESSENCE_BY_SKU[sku];
    if (essence == null) {
      throw new BadRequestException(`Unknown SKU: ${sku}`);
    }
    if (!decoded.transactionId) {
      throw new BadRequestException('Transaction has no transactionId.');
    }

    // Idempotency: a duplicate redeem (same Apple transactionId) is a
    // 409 with the previously-credited amount so the client can show a
    // friendly "already redeemed" toast and refresh.
    const existing = await this.prisma.iapPurchase.findUnique({
      where: { appleTransactionId: decoded.transactionId },
    });
    if (existing) {
      throw new ConflictException({
        message:           'Transaction already redeemed.',
        alreadyRedeemed:   true,
        essenceGranted:    existing.essenceGranted,
        transactionId:     existing.appleTransactionId,
      });
    }

    // Atomic credit: write the purchase row + bump sanctum_state in
    // a single Prisma transaction. Either both succeed or neither.
    const { purchase, sanctum } = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.iapPurchase.create({
        data: {
          rootId,
          sku,
          essenceGranted:     essence,
          appleTransactionId: decoded.transactionId!,
          appleEnvironment:   String(decoded.environment ?? 'Sandbox'),
          appleBundleId:      decoded.bundleId ?? APPLE_BUNDLE_ID,
        },
      });
      const sanctum = await tx.sanctumState.upsert({
        where:  { rootId },
        create: { rootId, veilEssence: essence },
        update: { veilEssence: { increment: essence } },
      });
      return { purchase, sanctum };
    });

    this.logger.log(
      `IAP redeemed: root=${rootId} sku=${sku} essence=+${essence} ` +
      `tx=${decoded.transactionId} env=${decoded.environment}`,
    );

    return {
      sku,
      essenceGranted:     essence,
      newEssenceBalance:  sanctum.veilEssence,
      transactionId:      decoded.transactionId,
      environment:        decoded.environment,
    };
  }

  /** Android Play Billing redemption. Verifies the purchase token via
   *  the Play Developer API, dedups on the Google orderId, and credits
   *  essence atomically. The client acknowledges/consumes the purchase
   *  after this returns (these are consumables). */
  private async redeemAndroid(rootId: string, purchaseToken: string, productId?: string) {
    if (!this.google.enabled) {
      throw new BadRequestException('Android purchases are not available yet.');
    }
    if (!productId) {
      throw new BadRequestException('productId is required for Android purchases.');
    }
    const essence = ESSENCE_BY_SKU[productId];
    if (essence == null) {
      throw new BadRequestException(`Unknown SKU: ${productId}`);
    }

    let info;
    try {
      info = await this.google.verifyProduct(productId, purchaseToken);
    } catch (e) {
      this.logger.warn(`Play verification failed: ${(e as Error).message}`);
      throw new BadRequestException('Purchase verification failed.');
    }
    if (info.purchaseState !== 0) {
      throw new BadRequestException(`Purchase not in a granted state (state=${info.purchaseState}).`);
    }
    if (!info.orderId) {
      throw new BadRequestException('Purchase has no orderId.');
    }

    // Idempotency on Google's orderId.
    const existing = await this.prisma.iapPurchase.findUnique({
      where: { googleOrderId: info.orderId },
    });
    if (existing) {
      throw new ConflictException({
        message:         'Transaction already redeemed.',
        alreadyRedeemed: true,
        essenceGranted:  existing.essenceGranted,
        transactionId:   existing.googleOrderId,
      });
    }

    const { sanctum } = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.iapPurchase.create({
        data: {
          rootId,
          sku:                 productId,
          essenceGranted:      essence,
          platform:            'android',
          googleOrderId:       info.orderId,
          googlePurchaseToken: purchaseToken,
        },
      });
      const sanctum = await tx.sanctumState.upsert({
        where:  { rootId },
        create: { rootId, veilEssence: essence },
        update: { veilEssence: { increment: essence } },
      });
      return { purchase, sanctum };
    });

    this.logger.log(
      `IAP redeemed (android): root=${rootId} sku=${productId} essence=+${essence} order=${info.orderId}`,
    );

    return {
      sku:               productId,
      essenceGranted:    essence,
      newEssenceBalance: sanctum.veilEssence,
      transactionId:     info.orderId,
      environment:       'Production',
    };
  }

  /** Verify the signed transaction against prod first, fall back to
   *  sandbox. Either returns the decoded payload or throws. */
  private async verify(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
    try {
      return await this.prodVerifier.verifyAndDecodeTransaction(signedTransaction);
    } catch (prodErr) {
      try {
        return await this.sandboxVerifier.verifyAndDecodeTransaction(signedTransaction);
      } catch (sandboxErr) {
        this.logger.warn('Receipt verification failed in both environments.', {
          prodErr:    (prodErr as Error)?.message,
          sandboxErr: (sandboxErr as Error)?.message,
        });
        throw new BadRequestException('Receipt verification failed.');
      }
    }
  }
}
