-- HEP Phase 2 Slice 1 — human-typable claim codes
--
-- The original claim token is 32 random bytes base64url — 43 characters of
-- mixed-case gibberish. Fine inside a QR code, impossible to type off a
-- receipt when the scan fails. Manual entry is the fallback that has to work
-- when everything else doesn't, so it cannot be the unusable path.
--
-- Adds a short code alongside the token. Both resolve the same claim.
-- Nullable because claims minted before this migration have no short code.

ALTER TABLE "guest_claims" ADD COLUMN "short_code_hash" TEXT;

CREATE UNIQUE INDEX "guest_claims_short_code_hash_key"
  ON "guest_claims"("short_code_hash");
