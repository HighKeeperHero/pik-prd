# The Forge — Heroes' Veritas fitness companion

A standalone **Expo / React Native** app: a Hevy/Strong-style workout
logger themed to Heroes' Veritas. It is a separate product from the
Codex game app but shares the same **PIK backend** and signs in with
the same **Codex (FateAccount) accounts**, so a hero's training feeds
their Fate XP and Forge pillar.

> The game ↔ fitness split is deliberate: two focused apps, one
> identity, one backend. The cross-app progression "bridge" runs
> server-side (see below) and can be formalized/toggled later.

## Run it

```bash
cd forge-app
npm install
npm start          # then press i (iOS), a (Android), or w (web)
```

Requires the [Expo](https://docs.expo.dev/) toolchain (`npx expo`).
The app targets Expo SDK 52 (React Native 0.76).

## Configuration

The backend URL defaults to the production PIK API. Override it either way:

- **Env var (simplest):** set `EXPO_PUBLIC_PIK_API_URL` before starting —
  `EXPO_PUBLIC_PIK_API_URL=http://192.168.1.20:8080 npx expo start`
  (or put it in a `.env` file; Expo inlines `EXPO_PUBLIC_*` automatically).
- **app.json:** set `expo.extra.pikApiUrl`.

Use your machine's **LAN IP**, not `localhost`, so a phone running
Expo Go can reach your local backend.

## How it connects to the Codex

- **Auth:** `POST /api/account/login` (email + password) → session token.
- **Identity:** `GET /api/account/heroes` then
  `POST /api/account/heroes/:id/select` binds the session to a hero;
  that hero's `rootId` scopes every Forge call.
- **Progression bridge (server-side):** sealing a workout
  (`POST /api/forge/:rootId/sessions/:id/finish`) grants Forge-pillar
  XP and Fate XP through the shared backend's training + leveling
  services, and writes the hero's Chronicle. The fitness app never
  computes game progression itself — it just logs the work.

## Structure

```
App.js                     boot → login → hero select → Forge
src/
  api.js                   PIK client (auth + forge endpoints)
  theme.js                 colors, formatting helpers
  storage.js               persisted session (AsyncStorage)
  ForgeMain.js             tabbed shell + session state + modals
  screens/
    LoginScreen.js
    HeroSelectScreen.js
    TrainScreen.js         home: regimens + start a rite
    ActiveSessionScreen.js live workout: set logging + rest timer
    HistoryScreen.js       sealed rites + lifetime totals
    FeatsScreen.js         personal records + weekly-volume chart
  components/
    ui.js                  shared primitives
    ExercisePickerModal.js movement library + custom-movement forge
    RegimenBuilderModal.js routine builder
    SummaryModal.js        post-workout XP + new Feats
```

## Features

- Movement library (global + custom), searchable by muscle group.
- Regimens (saved routines) with target sets/reps.
- Live session logging: weight×reps / reps / duration / distance,
  tap-to-complete sets, auto-seeded next set, rest timer.
- Auto-detected Feats (PRs): heaviest, est. 1RM, most reps, longest
  hold, farthest.
- History, lifetime stats, weekly-volume chart.
- Stays signed in between launches; one account → many heroes.
