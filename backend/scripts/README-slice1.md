# Slice 1 — seeding and verification

## ⚠ The internal-host trap

`railway run` executes the command **on your laptop** with the environment's
variables injected. `DATABASE_URL` points at `postgres.railway.internal`, which
only resolves *inside* Railway's private network. Any script that talks to the
database directly therefore fails with:

```
Can't reach database server at `postgres.railway.internal:5432`
```

The fix is to swap in the public URL for the duration of the command:

```bash
railway run --environment Staging --service pik-prd -- \
  sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx ts-node scripts/seed-experiences.ts'
```

This affects **only** scripts using Prisma directly (`seed-*`). The HTTP
harnesses (`verify-slice0`, `verify-slice1`, `fake-venue`) talk to the deployed
API over the public internet and are unaffected.

## Seed

```bash
cd backend

railway run --environment Staging --service pik-prd -- \
  sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx ts-node scripts/seed-experiences.ts'
```

Seeds, idempotently:
- `venue.reward_multiplier` config key — **required**; the config API refuses to
  create keys, so the calibration dial cannot be turned until it exists
- the `title_kingvale_echo` reference title
- the `echoes_of_kingvale` experience

Re-seeding never overwrites `Experience.rewards` or a live multiplier. Once an
experience is running, the DB row is the source of truth and a deploy must not
silently revert a calibration.

Assign it to a venue with `--assign <source_id>`, or via
`POST /api/sources/:id/experiences`.

## Verify

```bash
HV_API_URL=https://pik-prd-staging.up.railway.app \
HV_TEST_ROOT_ID=ee147494-d767-44eb-9ca0-e0a191bc1453 \
HV_TEST_ROOT_ID_B=e11ddcdc-0f89-44af-8707-e1aa7e40bb32 \
railway run --environment Staging --service pik-prd -- \
  npx ts-node scripts/verify-slice1.ts
```

`ROOT_ID_B` receives the guest claim, so it must be a hero you don't mind
granting XP to. Omit it and the redemption checks are skipped (and reported as
skipped, not passed).

## Demo

```bash
HV_API_URL=... HV_PLATFORM_ADMIN_KEY=... HV_TEST_ROOT_ID=... \
  npx ts-node scripts/fake-venue.ts [--outcome victory|timeout|abandoned] [--milestones N]
```

`fake-venue` prints; `verify-slice1` asserts. Use the first to show a partner
what integrating looks like, the second to know whether it works.

## On vacuous passes

The first real run of `verify-slice1` reported six green checks that had
verified nothing — `[].every(...)` is `true`, so "seats skipped for lack of
rewards scope ✓" passed against a run that had never started.

A test that passes when nothing happened is worse than one that fails: it
manufactures confidence. Two guards now exist and should be used for anything
new:

- **`checkAll(name, items, predicate)`** — fails when the collection is empty
  instead of passing vacuously.
- **`requireOrAbort(name, passed)`** — stops the run when a precondition fails,
  rather than emitting a screenful of failures that all share one cause.

If you add a check that asserts over seats, participants, or any list the
server produced, route it through `checkAll`.
