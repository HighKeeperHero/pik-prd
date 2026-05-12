// ============================================================
// IAP SKU table — server-authoritative essence amounts.
// The client may display marketing copy; only this table decides
// what gets credited. SKU strings must exactly match App Store
// Connect product IDs.
// ============================================================

export const ESSENCE_BY_SKU: Record<string, number> = {
  essence_small: 50,
  essence_pack:  300,
  essence_hoard: 1500,
};

export const APPLE_BUNDLE_ID = 'com.heroesveritas.codex';

// Apple App Store Connect numeric App ID — used by the receipt
// verifier to confirm the transaction is for this app and not a
// spoofed one from a different bundle.
export const APPLE_APP_APPLE_ID = 6768378368;
