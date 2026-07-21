# Slice 0 verification

Run after the Phase 2 Slice 0 deploy to confirm the partner contract actually
behaves as intended. Static checks (build, DI graph, route mapping) were done
at author time; this exercises runtime behavior, which nothing else covers.

```bash
cd backend

HV_API_URL=https://pik-prd-production.up.railway.app \
HV_PLATFORM_ADMIN_KEY='<the Railway value>' \
HV_TEST_ROOT_ID='<a real hero root_id>' \
npx ts-node scripts/verify-slice0.ts
```

Prefix the command with a space if your shell records history, so the key does
not land in `~/.zsh_history`. Never commit the key — `backend/.env` is
gitignored, but the safer habit is to export it per-shell.

## What it asserts

| # | Check | Why it matters |
|---|-------|----------------|
| 1 | Operator routes 403 without the staff key | `impersonate` minted a session for **any** hero with no guard at all |
| 2 | A scoped partner key can create a source + consent link | Baseline for the rest of the run |
| 3 | `title_granted` is rejected when the grant is `xp`-only | `SourceLink.scope` was stored but never parsed |
| 4 | Replaying the same `event_id` grants **no** additional XP | Venue hardware retries; ingest had no idempotency |
| 5 | Resulting level matches `levelFromXp()` | Ingest had been on the obsolete Python-MVP curve |
| 6 | A partner cannot read another venue's sessions | Tenant isolation |

It provisions a throwaway `Source` (`slice0-<timestamp>`), grants consent from
the test hero, runs the checks, then suspends the source. It never deletes the
hero and never touches other venues. Suspended test sources accumulate — clear
them out periodically via `/api/sources`.

## Caveats

- The migration `20260720120000_phase2_slice0_partner_hardening` was
  hand-written and **not** shadow-verified against a database (no local
  Postgres or Docker on the authoring machine). It is additive only — one
  column on `sources`, one new `ingest_receipts` table.
- Check 5 imports `levelFromXp` from `src/`, so run it from `backend/`.
- A non-zero exit means at least one guarantee is not holding. Do not onboard a
  partner until this is green.
