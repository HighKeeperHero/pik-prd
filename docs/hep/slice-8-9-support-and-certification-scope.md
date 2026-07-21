# Slices 8 & 9 — Support Console (P11) and Certification (P12)

Scoped 2026-07-21. The last two Tier A products from the 12-product
brief, and the only ones with no plan until now.

## Why these two, and why together

Both are the same disease as the missing password reset was.

- Diagnosing a venue problem today requires **a Heroes engineer with
  database access**.
- Deciding whether a venue is fit to open today requires **a Heroes
  engineer's judgement**, held in their head.

Each is a per-venue human dependency, and neither survives a second
partner. That is precisely the thing Phase 2 exists to remove — the
platform criterion is *onboard a venue in under a business day with no
custom engineering*, and we currently meet it only until something goes
wrong.

They are scoped together because certification is largely *the support
console's checks, run as a gate*. Building the read model twice would be
the waste.

---

# Slice 8 — Venue Support Console (P11)

**Audience: Heroes staff only** (decided). Cross-venue, platform-admin
authed.

## The shape: a read model, not a helpdesk

We already have every input — audit entries, analytics, run history,
reward states, telemetry, reversal, invite reissue. What is missing is
*one place that answers "what is wrong at this venue right now"* without
a psql prompt.

**Deliberately NOT building:** ticketing, SLAs, chat, email threading,
customer satisfaction scoring. That is a helpdesk product and buying one
is strictly better than building one. If ticketing becomes the need,
integrate — do not implement.

## Endpoints

```
GET /api/support/venues            → cross-venue health index
GET /api/support/venues/:sourceId  → everything about one venue
```

Both `PlatformAdminGuard`. Static UI at `/support.html`, shipped with the
backend like `/venue.html` — no second deploy target.

The index answers "where should I look first": last run, failing
thresholds, stuck rewards, expired claims, uncertified status, staff
still `invited`. The detail view answers "what happened here": recent
runs with outcome and per-seat reward state, room configs and their
validation verdicts, telemetry rollup, recent audit, breaker state.

## No new mutations

Every remedial action already exists and is already audited: reissue an
invite, reverse a reward, rotate a key, suspend a venue, roll back a room
config. The console **links to them and does not reimplement them**.

A read-only console is a smaller attack surface holding cross-tenant
data, and a support tool that can only look is a support tool that cannot
make things worse at 2am.

## ⚠ Decide before building: how much player data support sees

The detail view naturally wants hero identity to answer "why did this
player not get paid". That means a Heroes-internal screen displaying
player data across every venue.

Recommendation: **show `rootId` and reward state, not hero names or
account emails.** A support question is almost always "did this seat get
paid", which `rootId` answers. If a named lookup is genuinely needed it
should be a separate, separately-audited action rather than something
every support page render exposes. This deserves an explicit decision
rather than a default.

## Exit condition

A support question — *"why did this venue's run pay nothing?"* — is
answerable from one page, with no database access, **by someone who is
not the engineer who built it.**

---

# Slice 9 — Venue Certification (P12)

**A gate, with an audited override** (decided).

## What certification asserts

That a venue is fit to run a live experience for a paying guest. Almost
every input already exists, which is what makes this cheap:

| Check | Source |
|---|---|
| Venue is `active` and holds the right scopes | `Source` |
| At least one `active` owner (not merely invited) | `VenueStaff` |
| The experience is assigned and in season | `VenueExperience` |
| Its manifest is valid | `Experience.manifest` |
| A published `RoomConfig` exists and passed validation | Slice 4 |
| The room is certified for the device profile in use | Slice 4 |
| Telemetry is actually arriving | Slice 6 |
| No W9 threshold is failing | Slice 6 |
| Reward sync is healthy | Slice 6 (derived) |

Slice 4's publish gate is the template. This is the same pattern one
level up: room → venue.

## The design that matters: certification goes STALE, it does not expire

A time-based expiry is the obvious answer and the wrong one. A venue
certified on Monday whose room was recalibrated on Tuesday is not
certified, regardless of how many days are left.

So certification records **the identity of its inputs** — the
`roomConfigId` it certified, the experience version, a hash of the
venue's scopes — and is marked stale the moment any of them changes.
Recalibrating a room invalidates its venue's certification automatically,
because the thing that was certified no longer exists.

This is the same reasoning that makes `RoomConfig` immutable: a verdict
about a snapshot is meaningless once the snapshot moves.

A time bound can sit *on top* of that (recertify quarterly) but must not
replace it.

## The gate

`startRun` refuses when the venue is not certified for that experience.

**The override is what makes the gate survivable.** A gate with no
override strands a pilot mid-event with no path forward, and every
engineer learns to fear it. An override with no record is not a gate at
all. So: platform admin, `reason` required, written to the audit ledger,
scoped to one venue and one experience, and time-boxed.

That is deliberately the same shape as reward reversal — required reason,
append-only record — because it is the same class of decision: a human
overriding an automated control, on the record.

## Data

```
VenueCertification
- id, sourceId, experienceId
- status: certified | stale | revoked
- checks: Json          (the full verdict, frozen at certification)
- inputFingerprint: Json (roomConfigId, experienceVersion, scopes hash)
- certifiedAt, certifiedBy, notes
```

## Exit condition

A venue cannot run a live experience until certified; overriding leaves a
record naming who and why; and **recalibrating a room invalidates its
venue's certification without anyone remembering to.**

---

## Sequencing

**Slice 8 first.** It is smaller, it is read-only, and its checks are the
raw material for Slice 9 — building certification first would mean
writing the same aggregation twice.

Slice 7 (portal calibration UI) stays deferred until the design firm's
operator flow settles; building screens for a workflow they are still
designing is guessing.

## Risks worth naming now

- **Support console scope creep into a helpdesk.** The moment someone
  asks for a "notes" field on a venue, this becomes a CRM. Hold the line
  at read-only; integrate a helpdesk if ticketing is the real need.
- **Certification blocking a pilot.** Mitigated by the override, but the
  override must be tested — an escape hatch nobody has opened is not
  known to work. `verify-slice9` should exercise the override path, not
  just the happy one.
- **The checks passing vacuously.** Several inputs are "no data yet"
  early on — telemetry arriving, thresholds not failing. `no_data` must
  block certification rather than satisfy it, exactly as the Slice 6
  rollup already treats it. A venue certified because nothing had been
  measured would be the worst instance of this project's recurring bug.
