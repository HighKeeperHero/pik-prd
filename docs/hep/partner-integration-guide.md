# Heroes Experience Platform — Partner Integration Guide

**Audience:** engineers at a partner venue.
**Version:** v1 · 2026-07-21 · API `/api/partner/v1`

Heroes augments the attraction you already run. Your reservations, POS,
waivers, staff scheduling and room timers stay exactly as they are. You tell us
when a party starts and how it ends; we handle who the players are, what they
earn, and how that follows them home.

Integrating is four HTTP calls.

---

## 1. What you receive from Heroes

| | |
|---|---|
| `source_id` | your venue's identifier, e.g. `kingvale-keep` |
| API key | `X-PIK-API-Key`, shown **once** at issue |
| Portal owner invite | for your staff to manage the venue themselves |
| Assigned experiences | which Heroes content you may run |

The API key authenticates your **machines**. It is not a login — your staff use
the Partner Portal, which is a separate surface with its own accounts.

**Treat the key as a device secret.** It lives on hardware in a room full of
strangers. If it leaks, tell us and we rotate it; there is a hard cap on what
any single venue can grant in 24 hours, but that is a backstop, not a defence.

---

## 2. Base URL and conventions

```
Production   https://pik-prd-production.up.railway.app
Staging      https://pik-prd-staging.up.railway.app     ← integrate here first
```

Every response is wrapped:

```json
{ "status": "ok", "data": { … } }
{ "status": "error", "message": "…" }
```

All partner calls carry:

```
X-PIK-API-Key: <your key>
Content-Type: application/json
```

Confirm which environment answered at any time:

```bash
curl https://pik-prd-staging.up.railway.app/api/health
```

---

## 3. Before a party can play

A player must have **consented** to your venue. They do this themselves, in the
Heroes' Codex app, by scanning your venue QR — you cannot do it for them, and
`POST /runs` refuses any hero who has not.

Get your QR payload from the Portal (`assets.generate` permission):

```
GET /api/portal/v1/qr/venue
→ { "deep_link": "heroescodex://venue/kingvale-keep", … }
```

Print it where players check in. Scanning shows them your venue's name and
exactly what you are permitted to record, and they accept or decline.

> **Guests do not need any of this.** A walk-in with no Codex account can play
> immediately — see §6.

---

## 4. The run lifecycle

A **run** is one party's playthrough. It is the unit everything else hangs off:
rewards, analytics, completion rate.

### Start

```http
POST /api/partner/v1/runs
```
```json
{
  "experience_slug": "echoes_of_kingvale",
  "partner_run_key": "your-own-session-id-12345",
  "root_ids": ["e5ca4d08-…"],
  "guests":   [{ "label": "Player 3" }]
}
```

`partner_run_key` is **your** identifier for this booking. Send the same one
twice and you get the same run back rather than a duplicate — so a retry after
a network blip is safe.

### Heartbeat

```http
POST /api/partner/v1/runs/{run_id}/heartbeat
```

Every few minutes while the party plays. A run silent for **90 minutes** is
swept as abandoned and pays nothing. If your experience can legitimately run
longer, heartbeat it.

### Finish

```http
POST /api/partner/v1/runs/{run_id}/complete
POST /api/partner/v1/runs/{run_id}/fail
```
```json
{ "outcome": "victory", "milestones_hit": 3, "duration_sec": 1140 }
```

| Outcome | Call | Pays |
|---|---|---|
| Party won | `complete`, `outcome: victory` | 100% + 5% per milestone, max +20% |
| Timer expired | `fail`, `outcome: timeout` | 50%, no loot |
| Party left | `fail`, `outcome: abandoned` | nothing |

`milestones_hit` is yours to define — the beats your runtime knows the party
reached. Heroes never infers it.

Settling is idempotent: calling `complete` twice pays once and returns
`"replayed": true`.

---

## 5. What comes back

```json
{
  "run_id": "f72274dd-…",
  "status": "completed",
  "payout_multiplier": 1.2,
  "participants_settled": [
    { "root_id": "e5ca4d08-…", "reward_state": "applied",
      "applied": { "xp_granted": 720, "leveled_up": true, "fate_level": 6 } },
    { "guest_label": "Player 3", "reward_state": "pending",
      "claim_token": "29eIrnyW…", "claim_code": "WSDT-GYMS",
      "claim_expires_at": "2026-08-20T…" }
  ]
}
```

`reward_state` tells you what happened per seat:

| | |
|---|---|
| `applied` | paid to that hero |
| `pending` | guest seat — hand them their claim (§6) |
| `skipped` | not paid; `reason` says why |

---

## 6. Guests — the walk-in path

A guest seat produces **two credentials for the same claim**, returned once and
never again:

- `claim_token` — encode as a QR: `heroescodex://testament/<token>`
- `claim_code` — print beneath it, e.g. `WSDT-GYMS`

Print both. The code exists because scans fail in dim rooms, and the fallback
has to work when everything else already has. It uses no `I`, `O`, `0` or `1`,
so there is nothing to misread.

The guest installs Heroes' Codex, creates a hero, and redeems. Their rewards —
earned before they had an account — land on that hero. Claims expire after
**30 days**.

This is where your walk-in traffic becomes returning players, and the Portal
reports the conversion rate.

---

## 7. Reading your own data

```http
GET /api/partner/v1/venue              assigned experiences, live run count
GET /api/partner/v1/runs?limit=50      run history
GET /api/partner/v1/players/{root_id}  a consented player, incl. prior visits
```

Your key only ever sees your venue. Another venue's run reports as **not found**.

---

## 8. Errors worth handling

| Status | Meaning | Do |
|---|---|---|
| `403` scope | your venue is not licensed for that | contact Heroes |
| `403` consent | that player has not consented | have them scan the venue QR |
| `404` run | wrong run id, or not your venue | check the id |
| `409` | run already settled, or claim already redeemed | treat as success |
| `503` | platform admin not configured | contact Heroes |

A `403` on consent is the one your staff will meet most. It is not an error
state — it means a player has not opted in yet, and the fix is on their phone.

---

## 9. Integrating

Work against **staging** until the flow is right. Nothing there touches live
players.

`backend/scripts/fake-venue.ts` in the Heroes repo is a complete working client
— provision, start, heartbeat, settle, print the claim. It is the reference
implementation, and it runs on a laptop with no hardware at all.

Suggested order:

1. `GET /venue` — confirm your key and assigned experiences
2. Start and settle a run with one guest seat, no identified players
3. Redeem the claim on a test account end to end
4. Add identified players, having consented from the app first
5. Exercise `fail` with `timeout`, and confirm the reduced payout

---

## 10. Limits

| | |
|---|---|
| Run start / settle | 60 per minute |
| Heartbeat | 120 per minute |
| Claim lookup | 20 per minute |
| Daily XP per venue | capped; a backstop against a leaked key, not a normal ceiling |

---

## What Heroes does not do

We do not touch reservations, payments, waivers, staff scheduling, room timers,
or customer records. We never ask for your guest list. The only identity we
hold is the one a player brought with them and consented to share — and they
can withdraw that from their own app at any time, which stops future records
without removing anything they already earned.

Questions: your Heroes contact, or `support@heroesveritas.com`.
