# pik-prd environments

Written 2026-07-20 alongside HEP Phase 2 Slice 0.

## What exists

Railway project `PIK-PRD`, service `pik-prd`, two environments:

| | Staging | production |
|---|---|---|
| Env name (exact) | `Staging` | `production` (lowercase) |
| URL | `pik-prd-staging.up.railway.app` | `pik-prd-production.up.railway.app` |
| Deploys | automatically from `main` | automatically from `main`, **lagging** |
| Data | disposable (`StageProbe` et al.) | real alpha testers |

**Both environments auto-deploy from `main`. Production just arrives later.**

Observed 2026-07-20 pushing Slice 0: staging was serving the new build (403 on
the newly guarded routes) while production still served the old one (200) — for
roughly an hour. Production then picked it up on its own with no manual action.

This lag is a trap. It is easy to check production shortly after a push, see
old behavior, and conclude production is on a manual promote. It is not. **A
push to `main` reaches real players.** Treat every merge as a production
deploy and verify *both* hosts before assuming otherwise — the environment now
reports itself in `/api/health`, so:

```bash
curl -s https://pik-prd-production.up.railway.app/api/health
curl -s https://pik-prd-staging.up.railway.app/api/health
```

The exact promote/build trigger was not observed and is not documented here;
if it is ever made deliberate, update this section.

## The trap

The application code is **environment-blind**. There are zero references to
`RAILWAY_ENVIRONMENT`, `staging`, or `preview` anywhere in `backend/src`, so:

- logs are identical between the two,
- `/api/health` cannot tell you which environment answered,
- reading the source will convince you no split exists. It does.

`railway status` is the only authoritative answer. Treat the code as unable to
describe its own deployment.

**Worth fixing:** have `/api/health` report the environment. One field would
remove a whole class of "which one am I talking to?" mistakes, and it becomes
load-bearing in Phase 2 when partner venues point clients at one or the other.

## Migrations run at boot

The container CMD is `npx prisma migrate deploy && node dist/main.js`. A
migration that fails takes the boot down with it — so a bad migration is an
outage, not a bug. Railway keeps the previous container serving on a failed
deploy, which masks this: health stays 200 while the new build never lands.
When verifying a deploy, probe a route whose *behavior* changed, not `/health`.

## Env vars

Read via bare `process.env` — there is no `@nestjs/config` and no `dotenv`
dependency. `.env` reaches the process only because `@prisma/client` loads it on
import, which is incidental and should not be relied on. For local runs, export
the var in the shell rather than adding it to `.env`.

| Var | Notes |
|---|---|
| `DATABASE_URL` | Railway injects per environment |
| `PORT` | `8080` |
| `NODE_ENV` | only used to widen CORS in dev |
| `HV_PLATFORM_ADMIN_KEY` | Phase 2 Slice 0. **Different value per environment.** Guard fails closed — unset means operator routes 503 |
| `WEBAUTHN_RP_NAME` / `RP_ID` / `ORIGIN` | bound to the hostname; copying prod's values to staging produces passkey failures that look like client bugs |
| `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` | sign-in |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | omit on staging if IAP is untested there |
| `AR_PLACEHOLDER_USDZ_URL` | relic marks |

To run a local script against an environment's secrets without ever printing
them:

```bash
railway run --environment Staging --service pik-prd -- npx ts-node scripts/verify-slice0.ts
```

`--environment` and `--service` are required when not attached to a terminal.

## Seeding

Order matters; `seed:pop` silently degrades if skipped (Veil tears fall back to
the old 9-city rows):

```bash
npm run prisma:seed
npm run seed:pop
npm run seed:lore
npm run seed:quests
```

## Client pointing

The native app reads `EXPO_PUBLIC_PIK_API_URL`, defaulting to the **production**
URL (`src/api/pik.ts:12`). Point dev builds at staging via EAS env vars — and
diff `eas env:list` per environment first, since preview/development chronically
lack vars that only exist in production.
