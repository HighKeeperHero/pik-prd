# pik-prd environments

Written 2026-07-20 alongside HEP Phase 2 Slice 0.

## What exists

Railway project `PIK-PRD`, service `pik-prd`, two environments:

| | Staging | production |
|---|---|---|
| Env name (exact) | `Staging` | `production` (lowercase) |
| URL | `pik-prd-staging.up.railway.app` | `pik-prd-production.up.railway.app` |
| Deploys from | `main` branch | `production` branch |
| Data | disposable (`StageProbe` et al.) | real alpha testers |

## Promoting

`main` is safe to push: it reaches staging only. Production is an explicit
merge.

```bash
# 1. push work — deploys to staging
git push origin main

# 2. verify on staging
npx ts-node scripts/verify-slice1.ts       # or whatever the slice ships

# 3. promote — deploys to production
git checkout production
git merge --ff-only main
git push origin production
git checkout main
```

Because production only fast-forwards from `main`, the two can never diverge,
and every production deploy is a commit that has already run on staging.

### History: why this exists

Until 2026-07-21 **both** environments auto-deployed from `main`, production
just lagging ~1 hour behind. That lag actively deceived: checking production
shortly after a push showed old behavior, which reads exactly like a manual
promote. It was not one — a push to `main` reached real players, and there was
no way to test on staging without also shipping to production.

That was tolerable for guard/dedup work. It stopped being tolerable at Slice 1,
which grants XP and mints loot.

The `production` branch was created at `a77d8d0` — the exact commit production
was already running — so the cutover changed nothing that was deployed.

Verify which build answers, always empirically:

```bash
curl -s https://pik-prd-production.up.railway.app/api/health
curl -s https://pik-prd-staging.up.railway.app/api/health
```

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
