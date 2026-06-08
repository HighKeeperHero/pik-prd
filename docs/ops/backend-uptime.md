# Backend uptime & resilience (v1 launch)

The backend is a single Railway service (`pik-prd-production.up.railway.app`)
backed by Railway Postgres. This is the pre-launch checklist to keep it up and
the data safe.

## 1. Health checks (done in code)
- `GET /api/health` — **liveness**. Fast, dependency-free. Point Railway's
  service **Healthcheck Path** at `/api/health` so a bad deploy never goes live.
- `GET /api/health/ready` — **readiness**. Pings the DB (`SELECT 1`). Point an
  external uptime monitor here so a DB outage pages you, not just an app crash.

Both skip rate-limiting, so a monitor polling every 30–60s won't get throttled.

## 2. External uptime monitor — TODO (Tim, ~10 min)
Create a monitor (UptimeRobot free tier or BetterStack) on
`https://pik-prd-production.up.railway.app/api/health/ready`, interval 1–5 min,
alert to email/SMS. This is the difference between "a user told me it's down" and
"I knew in 60 seconds."

## 3. Database backups — TODO (Tim, CRITICAL before public launch)
There were no recoverable backups during the 2026-05-05 wipe. Do both:

**Primary — Railway managed backups.** Railway dashboard → Postgres service →
Backups → enable scheduled backups (daily). Requires a paid plan; cheapest
insurance you'll buy.

**Secondary — off-box pg_dump.** `backend/scripts/backup-db.sh` dumps to a file
and (optionally) uploads to S3/rclone. Schedule it daily via a Railway cron
service or a GitHub Action, with `BACKUP_DATABASE_URL` = the prod URL and
`BACKUP_S3_TARGET` = your bucket. Restore with:
```
pg_restore --clean --no-owner -d "$TARGET_DATABASE_URL" pik-<stamp>.dump
```

## 4. Backend error tracking — TODO (Tim + follow-up)
There is **no server-side Sentry** today (only the app has it). You're blind to
prod 500s. Minimum: create a backend project in the existing Sentry org
(`heroes-veritas-inc`), add `@sentry/node` + an exception filter gated on a
`SENTRY_DSN` env var. Until then, watch Railway logs and set a Railway log alert
on `ERROR`.

## 5. Service config — verify (Tim)
- **Plan tier:** non-sleeping plan with RAM headroom. The procedural Veil added
  ~100–200 MB to Postgres (≈1M `pop_cell` rows); confirm DB disk has room.
- **Restart policy:** Railway restarts on crash by default — confirm it's on.
- **DB connection limit:** append `?connection_limit=<n>` to the prod
  `DATABASE_URL` so Prisma doesn't exhaust Postgres `max_connections` under load.
- **Redundancy (post-launch):** the app is stateless (sessions in DB), so a 2nd
  replica is cheap insurance against single-instance failure.

## 6. Deploy gotcha (already bit once)
`prisma migrate deploy` runs on `main` push, but the population grid is loaded by
`npm run seed:pop` which is **NOT** part of deploy. After any deploy that needs a
fresh grid, run `seed:pop` against prod (Railway one-off / `railway run`), or the
Veil silently falls back to the legacy 9-city rows.
