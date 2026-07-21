# Standing up a staging environment for pik-prd

Written 2026-07-20 alongside HEP Phase 2 Slice 0.

## Why now

There is currently one environment. `main` pushes deploy straight to the
service that serves the alpha testers, and the container CMD is
`npx prisma migrate deploy && node dist/main.js` — so a bad migration doesn't
just ship a bug, it prevents the app from booting.

That was acceptable while PIK was a POC. It stops being acceptable in Phase 2
for a specific reason: partner venues integrate against this API. A partner
needs somewhere to develop and test their client that is not the database
holding real player progression, and Heroes needs somewhere to rehearse a
migration before it touches that database.

## Shape

Two Railway services, two Postgres instances, one repo, one branch strategy:

| | staging | production |
|---|---|---|
| Deploys from | `main` (auto) | git tag or manual promote (deliberate) |
| Database | its own Postgres | existing |
| Data | seeded / disposable | real players |
| Partner keys | partner sandbox keys | real venue keys |

The inversion matters: **`main` should auto-deploy to staging, not prod.**
Production becomes a deliberate promote. Today it is the reverse, which is why
every merge is a production event.

## Env vars

The backend reads these (via bare `process.env` — there is no `@nestjs/config`
and no `dotenv` dependency; `.env` reaches the process only because
`@prisma/client` loads it on import, which is incidental and should not be
relied on):

| Var | Staging value |
|---|---|
| `DATABASE_URL` | staging Postgres (Railway injects) |
| `PORT` | `8080` |
| `NODE_ENV` | `production` (widening CORS in dev is the only use) |
| `HV_PLATFORM_ADMIN_KEY` | **a different key from prod** |
| `WEBAUTHN_RP_NAME` / `RP_ID` / `ORIGIN` | must match the staging hostname or passkeys fail |
| `GOOGLE_CLIENT_ID` | same |
| `APPLE_CLIENT_ID` | same |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | can be omitted if IAP is untested on staging |
| `AR_PLACEHOLDER_USDZ_URL` | same |

`WEBAUTHN_*` is the one that silently breaks: the RP ID is bound to the origin,
so copying prod's values to a staging hostname produces passkey failures that
look like client bugs. Note also the app has **no** environment self-awareness —
nothing reads `RAILWAY_ENVIRONMENT` — so staging and prod are indistinguishable
in logs and in the `/api/health` response. Worth adding.

## Seeding

Order matters; `seed:pop` is the one that silently degrades if skipped:

```bash
npm run prisma:seed
npm run seed:pop      # or Veil tears fall back to the old 9-city rows
npm run seed:lore
npm run seed:quests
```

## Client pointing

The native app reads `EXPO_PUBLIC_PIK_API_URL`, defaulting to
`https://pik-prd-production.up.railway.app` (`src/api/pik.ts:12`). Point dev
builds at staging via EAS env vars — and diff `eas env:list` per environment
first, since preview/development chronically lack vars that only exist in
production.

## Cost

Two services + two Postgres. Small, and it buys a place to run
`scripts/verify-slice0.ts` and every future partner integration test without
touching player data.
