// ============================================================
// PIK — Generic Source Connector Template
//
// This is a reusable template for connecting ANY game, venue,
// or experience to PIK. Copy this file, configure the settings,
// and implement the 3 adapter functions for your source.
//
// How it works:
//   1. Your game/venue calls adapter functions when things happen
//   2. This connector translates those events into PIK format
//   3. Events are POSTed to PIK's ingest API with your API key
//
// Setup:
//   1. Register your source via PIK dashboard → Source Manager
//   2. Copy the generated API key
//   3. Set PIK_API_KEY and PIK_URL below
//   4. Implement the adapter functions for your game
//
// Usage: node connector.js
// ============================================================

// ── Configuration ────────────────────────────────────────
const CONFIG = {
  // PIK server URL (Railway production)
  PIK_URL: process.env.PIK_URL || 'https://pik-prd-production.up.railway.app',

  // API key from Source Manager (set via env for security)
  PIK_API_KEY: process.env.PIK_API_KEY || 'pik_your_key_here',

  // Your source ID (must match what's registered in PIK)
  SOURCE_ID: process.env.PIK_SOURCE_ID || 'src-your-game-01',

  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
};

// ── PIK Ingest Client ────────────────────────────────────

/**
 * Send an event to PIK's ingest API.
 * Automatically retries on transient failures.
 *
 * @param {string} rootId - The player's PIK root ID
 * @param {string} eventType - One of: progression.session_completed,
 *                             progression.fate_marker, progression.title_earned
 * @param {object} payload - Event-specific data
 * @returns {object} PIK response with event_id and changes_applied
 */
async function sendToPik(rootId, eventType, payload) {
  const url = `${CONFIG.PIK_URL}/api/ingest`;
  const body = {
    root_id: rootId,
    event_type: eventType,
    payload,
  };

  let lastError;
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PIK-API-Key': CONFIG.PIK_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 429) {
        // Rate limited — wait and retry
        const wait = CONFIG.RETRY_DELAY_MS * attempt;
        console.warn(`[PIK] Rate limited, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.message || `HTTP ${resp.status}`);
      }

      console.log(`[PIK] Event sent: ${eventType} for ${rootId}`);
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.MAX_RETRIES) {
        const wait = CONFIG.RETRY_DELAY_MS * attempt;
        console.warn(`[PIK] Attempt ${attempt} failed, retrying in ${wait}ms: ${err.message}`);
        await sleep(wait);
      }
    }
  }

  console.error(`[PIK] Failed after ${CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════
// ADAPTER FUNCTIONS — Implement these for your game/venue
// ════════════════════════════════════════════════════════════

/**
 * ADAPTER 1: Session Completed
 *
 * Call this when a player finishes a game session, level,
 * round, or visit. PIK will calculate XP based on the
 * difficulty and performance data you provide.
 *
 * @param {string} pikRootId - Player's PIK root ID
 * @param {object} sessionData - Your game's session result
 */
async function onSessionCompleted(pikRootId, sessionData) {
  // ┌──────────────────────────────────────────────────────┐
  // │  Map YOUR game's session data to PIK's format.       │
  // │  Customize the payload fields for your game.         │
  // └──────────────────────────────────────────────────────┘
  return sendToPik(pikRootId, 'progression.session_completed', {
    // Required: difficulty affects XP multiplier
    difficulty: sessionData.difficulty || 'normal', // normal | hard | heroic

    // Optional: boss damage percentage (0-100)
    // Affects boss bonus XP calculation
    boss_damage_pct: sessionData.bossDamage || 0,

    // Optional: nodes/stages/checkpoints completed
    // Each node grants node_xp from config
    nodes_completed: sessionData.nodesCompleted || 0,

    // ── Add your custom fields below ──
    // These are stored in the event payload for analytics
    // but don't affect XP calculation unless you customize
    // the ingest service.
    //
    // Examples:
    // score: sessionData.score,
    // time_seconds: sessionData.duration,
    // enemies_defeated: sessionData.kills,
    // puzzles_solved: sessionData.puzzles,
  });
}

/**
 * ADAPTER 2: Fate Marker Unlocked
 *
 * Call this when a player discovers a location, unlocks
 * an achievement, or reaches a milestone in your game.
 * Fate markers are permanent and cannot be removed.
 *
 * @param {string} pikRootId - Player's PIK root ID
 * @param {string} markerName - Unique marker identifier
 */
async function onFateMarkerUnlocked(pikRootId, markerName) {
  return sendToPik(pikRootId, 'progression.fate_marker', {
    // Marker format: "namespace:identifier"
    // Use your source ID as namespace to avoid collisions
    // e.g., "src-my-game:discovered-secret-cave"
    marker: `${CONFIG.SOURCE_ID}:${markerName}`,
  });
}

/**
 * ADAPTER 3: Title Earned
 *
 * Call this when a player earns a title, badge, or
 * achievement that should persist across all PIK sources.
 *
 * Note: Session completion already grants titles based on
 * XP milestones. Use this for custom titles specific to
 * your game.
 *
 * @param {string} pikRootId - Player's PIK root ID
 * @param {string} titleId - Unique title identifier
 */
async function onTitleEarned(pikRootId, titleId) {
  return sendToPik(pikRootId, 'progression.title_earned', {
    title: titleId,
  });
}

// ════════════════════════════════════════════════════════════
// EXAMPLE USAGE — Remove this section for production
// ════════════════════════════════════════════════════════════

async function exampleUsage() {
  const PLAYER_ROOT_ID = 'pik-root-demo-self-001';

  // Example 1: Player completes a session
  console.log('\n--- Session Completed ---');
  const sessionResult = await onSessionCompleted(PLAYER_ROOT_ID, {
    difficulty: 'normal',
    bossDamage: 75,
    nodesCompleted: 4,
  });
  console.log('Result:', JSON.stringify(sessionResult, null, 2));

  // Example 2: Player unlocks a fate marker
  console.log('\n--- Fate Marker Unlocked ---');
  const markerResult = await onFateMarkerUnlocked(
    PLAYER_ROOT_ID,
    'discovered-hidden-shrine',
  );
  console.log('Result:', JSON.stringify(markerResult, null, 2));

  // Example 3: Player earns a custom title
  console.log('\n--- Title Earned ---');
  const titleResult = await onTitleEarned(
    PLAYER_ROOT_ID,
    'title_arena_champion',
  );
  console.log('Result:', JSON.stringify(titleResult, null, 2));
}

// Run examples if executed directly
if (require.main === module) {
  console.log('PIK Generic Connector — Example Run');
  console.log(`Target: ${CONFIG.PIK_URL}`);
  console.log(`Source: ${CONFIG.SOURCE_ID}`);
  exampleUsage().catch(console.error);
}

// ── Export for use as a module ────────────────────────────
module.exports = {
  sendToPik,
  onSessionCompleted,
  onFateMarkerUnlocked,
  onTitleEarned,
  CONFIG,
};
