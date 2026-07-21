// ============================================================
// HEP Phase 2 Slice 1 — human-typable claim codes
//
// A guest leaves the venue with a printed claim. The QR carries the long
// token; this carries the fallback the guest types when the scan fails —
// and the fallback is precisely the path that must work when everything
// else has already gone wrong.
//
// The alphabet omits I, O, 0 and 1: a code is read off paper, in a queue,
// possibly by someone who has had a drink. Ambiguous glyphs are the whole
// failure mode, so the safe move is to never print them.
//
//   32 symbols ^ 8 = 1.1e12 combinations
//   against a 20/min rate limit on redemption
//
// Formatted XXXX-XXXX for legibility. The dash is cosmetic.
//
// NOTE ON NORMALIZATION: input is only uppercased and stripped of spaces
// and dashes. It is deliberately NOT "corrected" — folding O->0 or I->1
// would let a typo resolve to a DIFFERENT valid code and redeem someone
// else's claim. A wrong code must fail and be retyped, never silently
// match a stranger's reward.
//
// Place at: src/partner/claim-code.ts
// ============================================================

import { createHash, randomInt } from 'crypto';

/** No I, O, 0 or 1 — every glyph here is unambiguous on paper. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Generate a display code like "K7QM-4PXR". */
export function generateShortCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt is CSPRNG-backed; Math.random would be guessable.
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }
  return format(raw);
}

/** Insert the cosmetic dash: K7QM4PXR -> K7QM-4PXR. */
export function format(raw: string): string {
  const clean = normalize(raw);
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** Canonical form for hashing and lookup. Case, spaces and dashes only. */
export function normalize(input: string): string {
  return (input ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** True when every character is in the printed alphabet and the length fits. */
export function isWellFormed(input: string): boolean {
  const clean = normalize(input);
  if (clean.length !== CODE_LENGTH) return false;
  return [...clean].every((c) => ALPHABET.includes(c));
}

/**
 * True when the input should be treated as a short code rather than a long
 * token. Length alone is the discriminator: tokens are 43 characters.
 */
export function looksLikeShortCode(input: string): boolean {
  return normalize(input).length === CODE_LENGTH;
}

export function hashCode(input: string): string {
  return createHash('sha256').update(normalize(input)).digest('hex');
}
