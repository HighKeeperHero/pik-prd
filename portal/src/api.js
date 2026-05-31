/**
 * PIK API Client
 * 
 * Handles all communication with the PIK backend.
 * Supports both session-authenticated and public endpoints.
 * 
 * Usage:
 *   import api from './api';
 *   api.setBaseUrl('https://pik-prd-production.up.railway.app');
 *   api.setSession(token, rootId);
 *   const profile = await api.getProfile();
 */

let BASE_URL = '';
let SESSION_TOKEN = '';
let ROOT_ID = '';

// ── Config ──────────────────────────────────────────────

export function setBaseUrl(url) {
  BASE_URL = url.replace(/\/$/, '');
}

export function setSession(token, rootId) {
  SESSION_TOKEN = token;
  ROOT_ID = rootId;
}

export function getSession() {
  return { token: SESSION_TOKEN, rootId: ROOT_ID };
}

export function clearSession() {
  SESSION_TOKEN = '';
  ROOT_ID = '';
}

// ── HTTP helpers ────────────────────────────────────────

async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Accept': 'application/json' };
  
  if (body) headers['Content-Type'] = 'application/json';
  if (SESSION_TOKEN) headers['Authorization'] = `Bearer ${SESSION_TOKEN}`;

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await resp.json();
    
    // PIK API wraps responses in { status: "ok", data: ... }
    if (data.status === 'ok') return { ok: true, data: data.data };
    if (data.status === 'error') return { ok: false, error: data.message || 'Unknown error' };
    
    // Some endpoints return data directly
    return { ok: true, data };
  } catch (err) {
    console.error(`API ${method} ${path} failed:`, err);
    return { ok: false, error: err.message };
  }
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);

// ── Auth ────────────────────────────────────────────────

/** Demo login: impersonate a user to get a session token */
export async function impersonate(rootId) {
  const resp = await post(`/api/auth/impersonate/${rootId}`);
  if (resp.ok && resp.data) {
    const token = resp.data.session_token || resp.data.token || '';
    SESSION_TOKEN = token;
    ROOT_ID = rootId;
    return { ok: true, token, rootId };
  }
  return resp;
}

// ── Identity ────────────────────────────────────────────

/** Full player profile (hero name, XP, level, titles, markers) */
export async function getProfile(rootId = ROOT_ID) {
  return get(`/api/users/${rootId}`);
}

/** List all users (for user picker / demo) */
export async function listUsers() {
  return get('/api/users');
}

/** Update hero name, alignment, origin */
export async function updateProfile(updates, rootId = ROOT_ID) {
  return put(`/api/users/${rootId}/profile`, updates);
}

/** Enroll a new user (create account) */
export async function enrollUser(dto) {
  return post('/api/users/enroll', dto);
}

/** Set equipped title */
export async function equipTitle(titleId, rootId = ROOT_ID) {
  return put(`/api/users/${rootId}/equipped-title`, { title_id: titleId });
}

/** Event timeline */
export async function getTimeline(rootId = ROOT_ID) {
  return get(`/api/users/${rootId}/timeline`);
}

// ── Gear ────────────────────────────────────────────────

/** Current equipment loadout */
export async function getEquipment(rootId = ROOT_ID) {
  return get(`/api/users/${rootId}/equipment`);
}

/** Full inventory */
export async function getInventory(rootId = ROOT_ID) {
  return get(`/api/users/${rootId}/inventory`);
}

/** Computed stat modifiers */
export async function getModifiers(rootId = ROOT_ID) {
  return get(`/api/users/${rootId}/modifiers`);
}

/** Equip an item from inventory */
export async function equipItem(inventoryId, rootId = ROOT_ID) {
  return post(`/api/users/${rootId}/equipment/equip`, { inventory_id: inventoryId });
}

/** Unequip a slot */
export async function unequipSlot(slot, rootId = ROOT_ID) {
  return post(`/api/users/${rootId}/equipment/unequip`, { slot });
}

/** Dismantle an inventory item for Nexus */
export async function dismantleItem(inventoryId, rootId = ROOT_ID) {
  return post(`/api/users/${rootId}/inventory/${inventoryId}/dismantle`);
}

// ── Loot / Caches ───────────────────────────────────────

/** List player's caches (optionally filtered by status) */
export async function getCaches(status = null, rootId = ROOT_ID) {
  const qs = status ? `?status=${status}` : '';
  return get(`/api/users/${rootId}/caches${qs}`);
}

/** Open a sealed cache */
export async function openCache(cacheId, rootId = ROOT_ID) {
  return post(`/api/users/${rootId}/caches/${cacheId}/open`);
}

// ── Quests ──────────────────────────────────────────────

/** Quest board: available quests for player */
export async function getQuestBoard(rootId = ROOT_ID) {
  return get(`/api/quests/board/${rootId}`);
}

/** Player's active/completed quests */
export async function getPlayerQuests(rootId = ROOT_ID) {
  return get(`/api/quests/player/${rootId}`);
}

/** Accept a quest */
export async function acceptQuest(questId, rootId = ROOT_ID) {
  return post('/api/quests/accept', { root_id: rootId, quest_id: questId });
}

/** Evaluate quest progress */
export async function evaluateQuests(rootId = ROOT_ID) {
  return post(`/api/quests/evaluate/${rootId}`);
}

// ── Sessions ────────────────────────────────────────────

/** Player session history */
export async function getPlayerSessions(rootId = ROOT_ID) {
  return get(`/api/sessions/player/${rootId}`);
}

/** Live sessions across all sources */
export async function getLiveSessions() {
  return get('/api/sessions/live');
}

/** Live session counts */
export async function getLiveCounts() {
  return get('/api/sessions/live/counts');
}

// ── Leaderboard ─────────────────────────────────────────

/** Main leaderboard */
export async function getLeaderboard(params = {}) {
  const qs = new URLSearchParams();
  if (params.board) qs.set('board', params.board);
  if (params.period) qs.set('period', params.period);
  if (params.source) qs.set('source', params.source);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return get(`/api/leaderboard${q ? '?' + q : ''}`);
}

/** Leaderboard summary (top N across all boards) */
export async function getLeaderboardSummary(limit = 5) {
  return get(`/api/leaderboard/summary?limit=${limit}`);
}

// ── The Forge (gym / workout companion) ─────────────────

const del = (path) => request('DELETE', path);

/** Movement library (global + this hero's custom), optionally filtered */
export async function forgeExercises(params = {}, rootId = ROOT_ID) {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.q) qs.set('q', params.q);
  const q = qs.toString();
  return get(`/api/forge/${rootId}/exercises${q ? '?' + q : ''}`);
}

/** Create a custom movement */
export async function forgeCreateExercise(dto, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/exercises`, dto);
}

/** Per-movement set history + records */
export async function forgeExerciseHistory(exerciseId, rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/exercises/${exerciseId}/history`);
}

/** Saved regimens (routines) */
export async function forgeRegimens(rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/regimens`);
}

/** Create a regimen */
export async function forgeSaveRegimen(dto, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/regimens`, dto);
}

/** Update a regimen */
export async function forgeUpdateRegimen(regimenId, dto, rootId = ROOT_ID) {
  return put(`/api/forge/${rootId}/regimens/${regimenId}`, dto);
}

/** Archive a regimen */
export async function forgeDeleteRegimen(regimenId, rootId = ROOT_ID) {
  return del(`/api/forge/${rootId}/regimens/${regimenId}`);
}

/** Start a Forge Rite (optionally from a regimen) */
export async function forgeStartSession(dto = {}, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/sessions/start`, dto);
}

/** Get the active session (or null) */
export async function forgeActiveSession(rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/sessions/active`);
}

/** Get a session by id */
export async function forgeSession(sessionId, rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/sessions/${sessionId}`);
}

/** Add an exercise to the active session */
export async function forgeAddExercise(sessionId, exerciseId, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/sessions/${sessionId}/exercises`, { exercise_id: exerciseId });
}

/** Remove an exercise from the active session */
export async function forgeRemoveExercise(sessionId, sessionExerciseId, rootId = ROOT_ID) {
  return del(`/api/forge/${rootId}/sessions/${sessionId}/exercises/${sessionExerciseId}`);
}

/** Log a set */
export async function forgeLogSet(sessionId, dto, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/sessions/${sessionId}/sets`, dto);
}

/** Update a set */
export async function forgeUpdateSet(setId, dto, rootId = ROOT_ID) {
  return put(`/api/forge/${rootId}/sets/${setId}`, dto);
}

/** Delete a set */
export async function forgeDeleteSet(setId, rootId = ROOT_ID) {
  return del(`/api/forge/${rootId}/sets/${setId}`);
}

/** Seal the rite (finish the workout) */
export async function forgeFinishSession(sessionId, dto = {}, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/sessions/${sessionId}/finish`, dto);
}

/** Discard the active session */
export async function forgeDiscardSession(sessionId, rootId = ROOT_ID) {
  return post(`/api/forge/${rootId}/sessions/${sessionId}/discard`, {});
}

/** Completed session history */
export async function forgeHistory(limit = 20, rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/history?limit=${limit}`);
}

/** Personal records (Feats) */
export async function forgeRecords(rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/records`);
}

/** Aggregate stats */
export async function forgeStats(rootId = ROOT_ID) {
  return get(`/api/forge/${rootId}/stats`);
}

// ── Default export as namespace ─────────────────────────

const api = {
  setBaseUrl, setSession, getSession, clearSession,
  get, post, put,
  impersonate,
  getProfile, listUsers, updateProfile, enrollUser, equipTitle, getTimeline,
  getEquipment, getInventory, getModifiers, equipItem, unequipSlot, dismantleItem,
  getCaches, openCache,
  getQuestBoard, getPlayerQuests, acceptQuest, evaluateQuests,
  getPlayerSessions, getLiveSessions, getLiveCounts,
  getLeaderboard, getLeaderboardSummary,
  forgeExercises, forgeCreateExercise, forgeExerciseHistory,
  forgeRegimens, forgeSaveRegimen, forgeUpdateRegimen, forgeDeleteRegimen,
  forgeStartSession, forgeActiveSession, forgeSession,
  forgeAddExercise, forgeRemoveExercise,
  forgeLogSet, forgeUpdateSet, forgeDeleteSet,
  forgeFinishSession, forgeDiscardSession,
  forgeHistory, forgeRecords, forgeStats,
};

export default api;
