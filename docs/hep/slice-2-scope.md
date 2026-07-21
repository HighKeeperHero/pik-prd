# HEP Phase 2 — Slice 2 scope: Partner Portal

Proposed 2026-07-21. Depends on Slice 0 and Slice 1 (both live in production).

## The problem this actually solves

The Phase 2 success criterion is *"a new partner venue can be onboarded in less
than one business day"* with *"no custom engineering."*

Today onboarding is: a Heroes engineer runs curl commands with
`HV_PLATFORM_ADMIN_KEY` — a **single shared key with no tenant scoping at all**.
It sees every venue. It cannot be given to a partner. There is no way for a
venue owner to log in, and no way to attribute any action to a person.

So the load-bearing piece of the Partner Portal is not the UI. It is **staff
identity with per-venue RBAC**. Everything else in Product 1 is a screen on top
of that.

## The architectural split

Two distinct surfaces, deliberately separate:

| | `/api/partner/v1/*` | `/api/portal/v1/*` |
|---|---|---|
| Caller | the venue's **machines** | the venue's **humans** |
| Auth | `X-PIK-API-Key` (Slice 0) | staff session (Slice 2) |
| Shape | run lifecycle, check-in | administration, analytics |
| Failure mode | a headset retries | a person is confused |

Conflating them would mean a kiosk's API key could edit staff and rotate its own
credentials. Keeping them apart means a leaked venue key can start runs but
cannot administer anything.

## Data model

```
VenueStaff          a person at one venue
  id, sourceId, email, passwordHash, displayName,
  role: owner | manager | operator | viewer,
  status: active | suspended | invited,
  invitedBy, lastLoginAt
  @@unique([sourceId, email])     ← same email may work at two venues

VenueStaffSession   opaque bearer token, hashed at rest
  id, staffId, tokenHash, expiresAt, createdAt

VenueAuditEntry     who did what, per venue
  id, sourceId, staffId, action, target, metadata, createdAt
```

`IdentityEvent` is not reused for the audit log — it is keyed on `rootId` (a
hero), and staff actions are not hero-scoped. Forcing them in would corrupt a
player's chronicle with venue admin noise.

`@@unique([sourceId, email])` rather than a global unique: a regional manager
may legitimately hold accounts at several venues, and each is a separate grant.

## Roles

| | owner | manager | operator | viewer |
|---|---|---|---|---|
| View analytics | ✓ | ✓ | ✓ | ✓ |
| Start/settle runs from the portal | ✓ | ✓ | ✓ | |
| Assign / schedule experiences | ✓ | ✓ | | |
| Generate QR / NFC assets | ✓ | ✓ | | |
| Edit venue profile & hours | ✓ | ✓ | | |
| Manage staff | ✓ | | | |
| Rotate the venue API key | ✓ | | | |

Enforced by a `@RequireRole()` decorator over a `VenueStaffGuard`, so the matrix
lives in one readable place rather than scattered across handlers.

**Heroes staff (`HV_PLATFORM_ADMIN_KEY`) keeps cross-venue powers** — creating
venues, setting scopes, suspending a partner. Those are platform actions, not
venue actions, and no venue owner should hold them.

## Endpoints

```
POST   /api/portal/v1/auth/login          staff login
POST   /api/portal/v1/auth/logout
GET    /api/portal/v1/me                  who am I, which venue, what role

GET    /api/portal/v1/venue               profile, hours, contact, status
PATCH  /api/portal/v1/venue               owner|manager

GET    /api/portal/v1/staff               owner
POST   /api/portal/v1/staff/invite        owner
PATCH  /api/portal/v1/staff/:id           owner  (role / suspend)

GET    /api/portal/v1/experiences         assigned + schedule
PATCH  /api/portal/v1/experiences/:slug   owner|manager (enable, window)

POST   /api/portal/v1/qr/venue            consent/check-in QR payload
POST   /api/portal/v1/qr/experience/:slug

GET    /api/portal/v1/analytics           the brief's dashboard fields
GET    /api/portal/v1/runs                run history, filterable
```

## Analytics — what the data can already answer

Slice 1's `ExperienceRun` / `RunParticipant` / `GuestClaim` make most of the
brief's dashboard computable today:

| Brief field | Source |
|---|---|
| Session count | `ExperienceRun` count |
| Completion rate | `completed / (completed + failed + abandoned)` |
| Session duration | `durationSec` |
| Visitors | distinct participants |
| Repeat visitors | participants with >1 completed run |
| XP granted | sum over `RunParticipant.rewards` |
| Artifact rewards | caches/titles granted |
| Technical failures | `failureReason`, abandoned runs |
| Cross-venue continuation | heroes with runs at ≥2 sources |

Plus the one the brief does not ask for and a partner will care about most:
**walk-in conversion = claims redeemed ÷ guest seats issued.** It is the
clearest possible evidence for *"measurable increases in engagement or repeat
visitation attributable to Heroes integration."*

## Out of scope for Slice 2

Device management (Product 1's device fields need Product 7's device layer,
which has no owner), NFC registration hardware, printable asset design,
seasonal rotation UI beyond a date window, and billing.

## Sequencing

1. **2a — staff identity + RBAC + `/api/portal/v1` core.** Backend only,
   verifiable by harness. This is what actually unblocks onboarding.
2. **2b — analytics + QR endpoints.**
3. **2c — the portal UI.**

2a and 2b are testable the same way Slices 0 and 1 were. 2c needs a frontend
decision (see below) and is the only part that cannot be verified by a script.

## Open decision — the portal frontend

`portal/` is a 4,600-line player-facing POC (login, impersonate, tear map) with
no venue concept. It is not a starting point. Options: a new Vite app, static
pages served from `backend/public` like the existing dashboard, or defer the UI
entirely and onboard the pilot venue via API while the backend proves out.
