// ============================================================
// PIK — Google Play purchase verifier
//
// Verifies a one-time (consumable) product purchase against the
// Play Developer API using a service account. Gated on the
// GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var — when absent, Android
// IAP verification is simply disabled (iOS is unaffected).
//
// Setup (Tim): Play Console → Setup → API access → link a Google
// Cloud project, create a service account with the "View financial
// data, orders, and cancellation survey responses" permission, then
// set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON on Railway to the JSON key.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { APPLE_BUNDLE_ID } from './skus';

export interface AndroidPurchaseInfo {
  orderId: string;
  purchaseState: number;        // 0 = purchased, 1 = canceled, 2 = pending
  acknowledgementState?: number; // 0 = yet to be acknowledged, 1 = acknowledged
  productId: string;
}

@Injectable()
export class GooglePlayVerifier {
  private readonly logger = new Logger(GooglePlayVerifier.name);
  private auth: GoogleAuth | null = null;
  // Android package id == iOS bundle id by project convention.
  private readonly packageName = APPLE_BUNDLE_ID;

  constructor() {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      this.logger.warn(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set — Android IAP verification disabled.',
      );
      return;
    }
    try {
      const credentials = JSON.parse(raw);
      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
      this.logger.log('Google Play verifier ready.');
    } catch (e) {
      this.logger.error(
        `Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — Android IAP disabled: ${(e as Error).message}`,
      );
    }
  }

  get enabled(): boolean {
    return this.auth !== null;
  }

  /** Verify a one-time product purchase. Returns purchase info or throws. */
  async verifyProduct(productId: string, purchaseToken: string): Promise<AndroidPurchaseInfo> {
    if (!this.auth) {
      throw new Error('Android IAP verification is not configured.');
    }
    const client = await this.auth.getClient();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${this.packageName}/purchases/products/` +
      `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await client.request<{
      orderId?: string;
      purchaseState?: number;
      acknowledgementState?: number;
      purchaseTimeMillis?: string;
    }>({ url });

    const data = res.data ?? {};
    return {
      orderId: data.orderId ?? '',
      purchaseState: data.purchaseState ?? -1,
      acknowledgementState: data.acknowledgementState,
      productId,
    };
  }
}
