// ============================================================
// The Forge — PIK API client (React Native)
//
// Talks to the shared Heroes' Veritas / PIK backend. Auth reuses
// Codex (FateAccount) credentials: email/password → session
// token → select a hero → that hero's rootId scopes every Forge
// call. The backend wraps successful responses as
// { status: 'ok', data } and errors as { status: 'error', message }.
// ============================================================

import Constants from 'expo-constants';

const DEFAULT_BASE =
  process.env.EXPO_PUBLIC_PIK_API_URL ||
  Constants?.expoConfig?.extra?.pikApiUrl ||
  'https://pik-prd-production.up.railway.app';

let BASE_URL = DEFAULT_BASE.replace(/\/$/, '');
let TOKEN = '';
let ROOT_ID = '';

export function setBaseUrl(url) { BASE_URL = url.replace(/\/$/, ''); }
export function setSession(token, rootId) { TOKEN = token || ''; ROOT_ID = rootId || ''; }
export function setRootId(rootId) { ROOT_ID = rootId || ''; }
export function getRootId() { return ROOT_ID; }
export function clearSession() { TOKEN = ''; ROOT_ID = ''; }

async function request(method, path, body = null) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    // 204 (logout) has no body.
    if (resp.status === 204) return { ok: true, data: null };
    const data = await resp.json();
    if (data && data.status === 'ok') return { ok: true, data: data.data };
    if (data && data.status === 'error') return { ok: false, error: data.message || 'Request failed' };
    return { ok: resp.ok, data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b);
const put = (p, b) => request('PUT', p, b);
const del = (p) => request('DELETE', p);

// ── Auth (Codex / FateAccount) ──────────────────────────────────────────────
export const accountLogin = (email, password) => post('/api/account/login', { email, password });
export const accountRegister = (email, password, display_name) =>
  post('/api/account/register', { email, password, display_name });
export const listHeroes = () => get('/api/account/heroes');
export const selectHero = (heroId) => post(`/api/account/heroes/${heroId}/select`, {});
export const accountLogout = () => post('/api/account/logout', {});

// ── Forge — exercises ───────────────────────────────────────────────────────
export function forgeExercises(params = {}) {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.q) qs.set('q', params.q);
  const q = qs.toString();
  return get(`/api/forge/${ROOT_ID}/exercises${q ? '?' + q : ''}`);
}
export const forgeCreateExercise = (dto) => post(`/api/forge/${ROOT_ID}/exercises`, dto);
export const forgeExerciseHistory = (exerciseId) => get(`/api/forge/${ROOT_ID}/exercises/${exerciseId}/history`);

// ── Forge — regimens ────────────────────────────────────────────────────────
export const forgeRegimens = () => get(`/api/forge/${ROOT_ID}/regimens`);
export const forgeSaveRegimen = (dto) => post(`/api/forge/${ROOT_ID}/regimens`, dto);
export const forgeUpdateRegimen = (id, dto) => put(`/api/forge/${ROOT_ID}/regimens/${id}`, dto);
export const forgeDeleteRegimen = (id) => del(`/api/forge/${ROOT_ID}/regimens/${id}`);

// ── Forge — sessions ────────────────────────────────────────────────────────
export const forgeStartSession = (dto = {}) => post(`/api/forge/${ROOT_ID}/sessions/start`, dto);
export const forgeActiveSession = () => get(`/api/forge/${ROOT_ID}/sessions/active`);
export const forgeSession = (id) => get(`/api/forge/${ROOT_ID}/sessions/${id}`);
export const forgeAddExercise = (sid, exerciseId) => post(`/api/forge/${ROOT_ID}/sessions/${sid}/exercises`, { exercise_id: exerciseId });
export const forgeRemoveExercise = (sid, seId) => del(`/api/forge/${ROOT_ID}/sessions/${sid}/exercises/${seId}`);
export const forgeLogSet = (sid, dto) => post(`/api/forge/${ROOT_ID}/sessions/${sid}/sets`, dto);
export const forgeUpdateSet = (setId, dto) => put(`/api/forge/${ROOT_ID}/sets/${setId}`, dto);
export const forgeDeleteSet = (setId) => del(`/api/forge/${ROOT_ID}/sets/${setId}`);
export const forgeFinishSession = (sid, dto = {}) => post(`/api/forge/${ROOT_ID}/sessions/${sid}/finish`, dto);
export const forgeDiscardSession = (sid) => post(`/api/forge/${ROOT_ID}/sessions/${sid}/discard`, {});

// ── Forge — history / feats / stats ─────────────────────────────────────────
export const forgeHistory = (limit = 30) => get(`/api/forge/${ROOT_ID}/history?limit=${limit}`);
export const forgeRecords = () => get(`/api/forge/${ROOT_ID}/records`);
export const forgeStats = () => get(`/api/forge/${ROOT_ID}/stats`);

export default {
  setBaseUrl, setSession, setRootId, getRootId, clearSession,
  accountLogin, accountRegister, listHeroes, selectHero, accountLogout,
  forgeExercises, forgeCreateExercise, forgeExerciseHistory,
  forgeRegimens, forgeSaveRegimen, forgeUpdateRegimen, forgeDeleteRegimen,
  forgeStartSession, forgeActiveSession, forgeSession,
  forgeAddExercise, forgeRemoveExercise,
  forgeLogSet, forgeUpdateSet, forgeDeleteSet,
  forgeFinishSession, forgeDiscardSession,
  forgeHistory, forgeRecords, forgeStats,
};
