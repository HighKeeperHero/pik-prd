// ══════════════════════════════════════════════════════════
// THE FORGE — gym / workout companion (Sprint 33)
//
// A Hevy/Strong-style workout logger woven into the Heroes'
// Veritas Codex. Build Regimens (routines), run a Forge Rite
// (workout), log sets, seal the rite — and earn Forge-pillar XP
// and Fate XP that flow back into the hero's progression.
//
// Visual language mirrors the PIK portal: ink-black ground,
// Crimson Pro serif display, DM Sans body, ember-amber accent.
// ══════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import api from './api.js';

// ── Theme ──
const FONT   = "'Crimson Pro', 'Georgia', serif";
const FONT_B = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BG       = '#08080f';
const SURFACE  = 'rgba(255,255,255,0.025)';
const SURFACE2 = 'rgba(255,255,255,0.045)';
const BORDER   = 'rgba(255,255,255,0.07)';
const MUTED    = 'rgba(255,255,255,0.35)';
const DIM      = 'rgba(255,255,255,0.55)';
const EMBER    = '#f59e0b';
const EMBER_D  = '#d97706';
const GREEN    = '#22c55e';

const CATS = [
  { key: 'chest', label: 'Chest' }, { key: 'back', label: 'Back' },
  { key: 'legs', label: 'Legs' }, { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' }, { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' }, { key: 'other', label: 'Other' },
];
const CAT_LABEL = Object.fromEntries(CATS.map(c => [c.key, c.label]));

const REC_LABEL = {
  max_weight: 'Heaviest', est_1rm: 'Est. 1RM', max_reps: 'Most Reps',
  best_duration: 'Longest Hold', best_distance: 'Farthest',
};

// ── small helpers ──
const fmtDur = (sec) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};
const fmtClock = (sec) => {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const fmtVol = (kg) => (kg == null ? '0' : Math.round(kg).toLocaleString());
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const recValue = (r) => {
  if (r.record_type === 'max_weight') return `${r.value} kg × ${r.reps ?? '—'}`;
  if (r.record_type === 'est_1rm')    return `${Math.round(r.value)} kg`;
  if (r.record_type === 'max_reps')   return `${r.value} reps`;
  if (r.record_type === 'best_duration') return fmtDur(r.value);
  if (r.record_type === 'best_distance') return `${(r.value / 1000).toFixed(2)} km`;
  return String(r.value);
};

// ══════════════════════════════════════════════════════════
export default function ForgeApp({ rootId, onExit }) {
  const [view, setView]         = useState('train'); // train | active | history | feats
  const [session, setSession]   = useState(null);
  const [regimens, setRegimens] = useState([]);
  const [history, setHistory]   = useState([]);
  const [records, setRecords]   = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [picker, setPicker]     = useState(null);  // { onPick, multi, title }
  const [builder, setBuilder]   = useState(null);  // regimen builder state
  const [summary, setSummary]   = useState(null);  // finish result
  const [toast, setToast]       = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ── initial load ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const [act, regs] = await Promise.all([
        api.forgeActiveSession(rootId),
        api.forgeRegimens(rootId),
      ]);
      if (!alive) return;
      if (act.ok && act.data) { setSession(act.data); }
      if (regs.ok) setRegimens(regs.data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [rootId]);

  const refreshSession = useCallback(async (sid) => {
    const id = sid || session?.session_id;
    if (!id) return;
    const r = await api.forgeSession(id, rootId);
    if (r.ok) setSession(r.data);
  }, [session, rootId]);

  const loadHistory = useCallback(async () => {
    const [h, s] = await Promise.all([api.forgeHistory(30, rootId), api.forgeStats(rootId)]);
    if (h.ok) setHistory(h.data || []);
    if (s.ok) setStats(s.data);
  }, [rootId]);

  const loadFeats = useCallback(async () => {
    const [rec, s] = await Promise.all([api.forgeRecords(rootId), api.forgeStats(rootId)]);
    if (rec.ok) setRecords(rec.data || []);
    if (s.ok) setStats(s.data);
  }, [rootId]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);
  useEffect(() => { if (view === 'feats') loadFeats(); }, [view, loadFeats]);

  // ── session actions ──
  const startSession = async (regimenId) => {
    const r = await api.forgeStartSession(regimenId ? { regimen_id: regimenId } : {}, rootId);
    if (r.ok) { setSession(r.data); setView('active'); }
    else showToast('Could not begin the rite.');
  };

  const finishSession = async (notes) => {
    if (!session) return;
    const r = await api.forgeFinishSession(session.session_id, { notes }, rootId);
    if (r.ok) {
      setSummary(r.data);
      setSession(null);
      setView('train');
    } else showToast('Could not seal the rite.');
  };

  const discardSession = async () => {
    if (!session) return;
    await api.forgeDiscardSession(session.session_id, rootId);
    setSession(null);
    setView('train');
  };

  // ── render ──
  return (
    <div style={S.shell}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <Header view={view} onExit={onExit} session={session} onResume={() => setView('active')} />

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 90 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: DIM, padding: 40, fontFamily: FONT_B }}>Stoking the Forge…</p>
        ) : view === 'train' ? (
          <TrainView
            session={session}
            regimens={regimens}
            onResume={() => setView('active')}
            onStartEmpty={() => startSession(null)}
            onStartRegimen={startSession}
            onNewRegimen={() => setBuilder({ name: '', exercises: [] })}
            onEditRegimen={(reg) => setBuilder({
              regimen_id: reg.regimen_id, name: reg.name, theme_title: reg.theme_title,
              notes: reg.notes, exercises: reg.exercises.map(e => ({
                exercise_id: e.exercise_id, name: e.name, theme_name: e.theme_name,
                category: e.category, target_sets: e.target_sets, target_reps: e.target_reps,
              })),
            })}
            onDeleteRegimen={async (id) => {
              await api.forgeDeleteRegimen(id, rootId);
              const r = await api.forgeRegimens(rootId);
              if (r.ok) setRegimens(r.data || []);
            }}
          />
        ) : view === 'active' ? (
          <ActiveView
            rootId={rootId}
            session={session}
            refresh={refreshSession}
            setSession={setSession}
            onAddExercise={() => setPicker({
              title: 'Add a Movement',
              onPick: async (ex) => {
                const r = await api.forgeAddExercise(session.session_id, ex.exercise_id, rootId);
                if (r.ok) setSession(r.data);
                setPicker(null);
              },
            })}
            onFinish={finishSession}
            onDiscard={discardSession}
            showToast={showToast}
          />
        ) : view === 'history' ? (
          <HistoryView history={history} stats={stats} />
        ) : (
          <FeatsView records={records} stats={stats} />
        )}
      </div>

      <BottomNav view={view} setView={setView} hasActive={!!session} />

      {picker && (
        <ExercisePicker
          rootId={rootId}
          title={picker.title}
          onClose={() => setPicker(null)}
          onPick={picker.onPick}
        />
      )}
      {builder && (
        <RegimenBuilder
          rootId={rootId}
          initial={builder}
          openPicker={(onPick) => setPicker({ title: 'Add to Regimen', onPick: (ex) => { onPick(ex); setPicker(null); } })}
          onClose={() => setBuilder(null)}
          onSaved={async () => {
            setBuilder(null);
            const r = await api.forgeRegimens(rootId);
            if (r.ok) setRegimens(r.data || []);
            showToast('Regimen inscribed.');
          }}
        />
      )}
      {summary && <SummaryModal data={summary} onClose={() => setSummary(null)} />}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// HEADER
// ══════════════════════════════════════════════════════════
function Header({ view, onExit, session, onResume }) {
  const titles = { train: 'The Forge', active: 'Forge Rite', history: 'Chronicle', feats: 'Feats' };
  return (
    <div style={S.header}>
      <button onClick={onExit} style={S.iconBtn} aria-label="Back">{'←'}</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={S.emberMark}>{'⚒️'}</div>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, color: '#fff', letterSpacing: '0.01em' }}>
          {titles[view] || 'The Forge'}
        </span>
      </div>
      {view !== 'active' && session
        ? <button onClick={onResume} style={S.resumePill}>Resume {'•'}</button>
        : <div style={{ width: 32 }} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// TRAIN (home)
// ══════════════════════════════════════════════════════════
function TrainView({ session, regimens, onResume, onStartEmpty, onStartRegimen, onNewRegimen, onEditRegimen, onDeleteRegimen }) {
  return (
    <div style={S.page}>
      {session && (
        <div style={S.resumeCard} onClick={onResume}>
          <div>
            <div style={{ fontSize: 11, color: EMBER, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Rite in progress</div>
            <div style={{ fontFamily: FONT, fontSize: 18, color: '#fff', marginTop: 2 }}>{session.name}</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{session.exercises?.length || 0} movements logged</div>
          </div>
          <span style={S.resumeArrow}>{'→'}</span>
        </div>
      )}

      <button style={S.primaryBtn} onClick={onStartEmpty}>{'⚒️'}  Begin Empty Rite</button>

      <div style={S.sectionRow}>
        <h3 style={S.sectionTitle}>Regimens</h3>
        <button style={S.ghostBtn} onClick={onNewRegimen}>+ New</button>
      </div>

      {regimens.length === 0 && (
        <div style={S.empty}>
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, color: DIM }}>No Forms yet.</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: MUTED }}>A Regimen is a saved routine — your repeatable path through the Forge.</p>
        </div>
      )}

      {regimens.map(reg => (
        <div key={reg.regimen_id} style={S.regimenCard}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 600, color: '#fff' }}>{reg.name}</div>
            {reg.theme_title && <div style={{ fontSize: 12, color: EMBER, fontStyle: 'italic', marginTop: 1 }}>{reg.theme_title}</div>}
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {reg.exercises?.map(e => e.name).join(' · ') || 'Empty'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 10 }}>
            <button style={S.startBtn} onClick={() => onStartRegimen(reg.regimen_id)} disabled={!!session}>Start</button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={S.miniBtn} onClick={() => onEditRegimen(reg)}>Edit</button>
              <button style={S.miniBtn} onClick={() => { if (confirm(`Archive "${reg.name}"?`)) onDeleteRegimen(reg.regimen_id); }}>{'✕'}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ACTIVE SESSION
// ══════════════════════════════════════════════════════════
function ActiveView({ rootId, session, refresh, setSession, onAddExercise, onFinish, onDiscard, showToast }) {
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(null); // { remaining, total }
  const [finishing, setFinishing] = useState(false);
  const startMs = useRef(session ? new Date(session.started_at).getTime() : Date.now());

  useEffect(() => {
    startMs.current = session ? new Date(session.started_at).getTime() : Date.now();
  }, [session?.session_id]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startMs.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!rest) return;
    if (rest.remaining <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest(r => r ? { ...r, remaining: r.remaining - 1 } : null), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  if (!session) return null;
  const volume = (session.exercises || []).reduce((acc, se) =>
    acc + (se.sets || []).reduce((a, s) => a + (s.completed && !s.is_warmup && s.weight && s.reps ? s.weight * s.reps : 0), 0), 0);
  const doneSets = (session.exercises || []).reduce((a, se) => a + (se.sets || []).filter(s => s.completed).length, 0);

  return (
    <div style={S.page}>
      {/* live metrics */}
      <div style={S.metricBar}>
        <Metric label="Time" value={fmtClock(elapsed)} />
        <Metric label="Volume" value={`${fmtVol(volume)} kg`} />
        <Metric label="Sets" value={String(doneSets)} />
      </div>

      {(session.exercises || []).map(se => (
        <ExerciseCard
          key={se.session_exercise_id}
          rootId={rootId}
          sessionId={session.session_id}
          se={se}
          onChanged={() => refresh()}
          onSetCompleted={() => setRest({ remaining: 120, total: 120 })}
          showToast={showToast}
        />
      ))}

      <button style={S.addExBtn} onClick={onAddExercise}>+ Add Movement</button>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          style={{ ...S.primaryBtn, flex: 2, margin: 0, opacity: finishing ? 0.6 : 1 }}
          disabled={finishing}
          onClick={async () => { setFinishing(true); await onFinish(); setFinishing(false); }}
        >
          {finishing ? 'Sealing…' : 'Seal the Rite'}
        </button>
        <button style={S.discardBtn} onClick={() => { if (confirm('Discard this rite? Nothing will be recorded.')) onDiscard(); }}>Discard</button>
      </div>

      {rest && (
        <div style={S.restBar}>
          <span style={{ fontFamily: FONT_B, fontSize: 13, color: DIM }}>Rest</span>
          <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: EMBER }}>{fmtClock(rest.remaining)}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={S.restBtn} onClick={() => setRest(r => ({ ...r, remaining: r.remaining + 15 }))}>+15s</button>
            <button style={S.restBtn} onClick={() => setRest(null)}>Skip</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ── Exercise card with set rows ──
function ExerciseCard({ rootId, sessionId, se, onChanged, onSetCompleted, showToast }) {
  const lt = se.log_type || 'weight_reps';

  return (
    <div style={S.exCard}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: '#fff' }}>{se.name}</div>
          {se.theme_name && <div style={{ fontSize: 11, color: EMBER, fontStyle: 'italic' }}>{se.theme_name}</div>}
        </div>
        <span style={S.catTag}>{CAT_LABEL[se.category] || se.category}</span>
      </div>

      {/* column header */}
      <div style={S.setHeadRow}>
        <span style={{ width: 28 }}>Set</span>
        {lt === 'weight_reps' && <><span style={S.colCell}>kg</span><span style={S.colCell}>reps</span></>}
        {lt === 'reps' && <span style={{ ...S.colCell, flex: 2 }}>reps</span>}
        {lt === 'duration' && <span style={{ ...S.colCell, flex: 2 }}>seconds</span>}
        {lt === 'distance' && <span style={{ ...S.colCell, flex: 2 }}>meters</span>}
        <span style={{ width: 36 }}></span>
      </div>

      {(se.sets || []).map((set, i) => (
        <SetRow key={set.set_id} rootId={rootId} set={set} index={i} logType={lt}
          onCompleted={onSetCompleted} onChanged={onChanged} showToast={showToast} />
      ))}

      <AddSetButton sessionId={sessionId} seId={se.session_exercise_id} sets={se.sets || []} rootId={rootId} onChanged={onChanged} />
    </div>
  );
}

function AddSetButton({ sessionId, seId, sets, rootId, onChanged }) {
  const add = async () => {
    // Seed the new set from the previous one so logging the next is one tap away.
    const last = sets[sets.length - 1];
    await api.forgeLogSet(sessionId, {
      session_exercise_id: seId,
      weight: last?.weight ?? undefined,
      reps: last?.reps ?? undefined,
      completed: false,
    }, rootId);
    onChanged();
  };
  return <button style={S.addSetBtn} onClick={add}>+ Add Set</button>;
}

function SetRow({ rootId, set, index, logType, onCompleted, onChanged }) {
  const [weight, setWeight] = useState(set.weight ?? '');
  const [reps, setReps]     = useState(set.reps ?? '');
  const [dur, setDur]       = useState(set.duration_sec ?? '');
  const [dist, setDist]     = useState(set.distance_m ?? '');
  const [done, setDone]     = useState(set.completed);

  useEffect(() => { setDone(set.completed); }, [set.completed]);

  const persist = async (extra) => {
    await api.forgeUpdateSet(set.set_id, {
      weight: weight === '' ? undefined : Number(weight),
      reps: reps === '' ? undefined : Number(reps),
      duration_sec: dur === '' ? undefined : Number(dur),
      distance_m: dist === '' ? undefined : Number(dist),
      ...extra,
    }, rootId);
  };

  const toggle = async () => {
    const next = !done;
    setDone(next);
    await persist({ completed: next });
    if (next) onCompleted();
  };

  const remove = async () => { await api.forgeDeleteSet(set.set_id, rootId); onChanged(); };

  const cell = (val, set_, ph) => (
    <input
      type="number" inputMode="decimal" value={val} placeholder={ph}
      onChange={e => set_(e.target.value)} onBlur={() => persist({})}
      style={{ ...S.setInput, ...(done ? S.setInputDone : {}) }}
    />
  );

  return (
    <div style={{ ...S.setRow, ...(set.is_pr ? S.setRowPr : {}) }}>
      <span style={{ width: 28, textAlign: 'center', fontSize: 13, color: set.is_warmup ? EMBER : DIM, fontWeight: 600 }}>
        {set.is_warmup ? 'W' : index + 1}
      </span>
      {logType === 'weight_reps' && <>{cell(weight, setWeight, '0')}{cell(reps, setReps, '0')}</>}
      {logType === 'reps'     && <div style={{ flex: 2 }}>{cell(reps, setReps, '0')}</div>}
      {logType === 'duration' && <div style={{ flex: 2 }}>{cell(dur, setDur, '0')}</div>}
      {logType === 'distance' && <div style={{ flex: 2 }}>{cell(dist, setDist, '0')}</div>}
      <button onClick={toggle} style={{ ...S.checkBtn, ...(done ? S.checkBtnOn : {}) }} aria-label="Complete set">
        {done ? '✓' : ''}
      </button>
      <button onClick={remove} style={S.rowDel} aria-label="Delete set">{'✕'}</button>
      {set.is_pr && <span style={S.prFlag}>PR</span>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════
function HistoryView({ history, stats }) {
  return (
    <div style={S.page}>
      {stats && (
        <div style={S.statGrid}>
          <Stat label="Rites" value={stats.total_sessions} />
          <Stat label="Volume" value={`${(stats.total_volume / 1000).toFixed(1)}t`} />
          <Stat label="Sets" value={stats.total_sets} />
          <Stat label="Feats" value={stats.total_feats} />
        </div>
      )}
      {history.length === 0 && <div style={S.empty}><p style={{ margin: 0, color: DIM, fontFamily: FONT }}>No rites sealed yet.</p></div>}
      {history.map(h => (
        <div key={h.session_id} style={S.histCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 600, color: '#fff' }}>{h.name}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{fmtDate(h.completed_at)}</div>
          </div>
          <div style={{ display: 'flex', gap: 14, margin: '6px 0 8px' }}>
            <Pill icon="⏱" text={fmtDur(h.duration_sec)} />
            <Pill icon="🏋" text={`${fmtVol(h.total_volume)} kg`} />
            <Pill icon="✓" text={`${h.total_sets} sets`} />
            {h.pr_count > 0 && <Pill icon="★" text={`${h.pr_count} PR`} amber />}
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
            {(h.exercises || []).map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                <span style={{ color: DIM }}>{e.sets}× {e.name}</span>
                {e.top_set && <span style={{ color: MUTED }}>{e.top_set.weight} kg × {e.top_set.reps}</span>}
              </div>
            ))}
          </div>
          {h.fate_xp > 0 && <div style={{ marginTop: 8, fontSize: 12, color: EMBER }}>+{h.fate_xp} Fate XP · +{h.forge_xp} Forge XP</div>}
        </div>
      ))}
    </div>
  );
}

function Pill({ icon, text, amber }) {
  return <span style={{ fontSize: 12, color: amber ? EMBER : DIM, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ opacity: 0.8 }}>{icon}</span>{text}</span>;
}
function Stat({ label, value }) {
  return (
    <div style={S.statCell}>
      <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// FEATS (PRs)
// ══════════════════════════════════════════════════════════
function FeatsView({ records, stats }) {
  const weekly = stats?.weekly_volume || [];
  const max = Math.max(1, ...weekly.map(w => w.volume));
  // group records by exercise
  const byEx = {};
  for (const r of records) { (byEx[r.exercise] ||= []).push(r); }

  return (
    <div style={S.page}>
      {weekly.length > 0 && (
        <div style={S.chartCard}>
          <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Weekly Volume</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 90 }}>
            {weekly.map((w, i) => (
              <div key={i} title={`${fmtVol(w.volume)} kg`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: `${Math.max(4, (w.volume / max) * 78)}px`, background: `linear-gradient(180deg, ${EMBER}, ${EMBER_D})`, borderRadius: '3px 3px 0 0' }} />
                <span style={{ fontSize: 8, color: MUTED }}>{w.week_of.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && <div style={S.empty}><p style={{ margin: 0, color: DIM, fontFamily: FONT }}>No Feats struck yet. Seal a rite to begin.</p></div>}

      {Object.entries(byEx).map(([ex, recs]) => (
        <div key={ex} style={S.featCard}>
          <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{ex}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recs.map(r => (
              <div key={r.record_id} style={S.featChip}>
                <span style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{REC_LABEL[r.record_type] || r.record_type}</span>
                <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: EMBER }}>{recValue(r)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// EXERCISE PICKER (modal)
// ══════════════════════════════════════════════════════════
function ExercisePicker({ rootId, title, onClose, onPick }) {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.forgeExercises({ category: cat || undefined, q: q || undefined }, rootId);
    if (r.ok) setAll(r.data || []);
    setLoading(false);
  }, [cat, q, rootId]);

  useEffect(() => { const t = setTimeout(load, 180); return () => clearTimeout(t); }, [load]);

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modalSheet} onClick={e => e.stopPropagation()}>
        <div style={S.modalHandle} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONT, fontSize: 19, color: '#fff', margin: 0 }}>{title}</h3>
          <button style={S.ghostBtn} onClick={() => setCreating(true)}>+ Custom</button>
        </div>

        {creating ? (
          <CustomExerciseForm rootId={rootId} onCancel={() => setCreating(false)} onCreated={(ex) => { setCreating(false); onPick(ex); }} />
        ) : (
          <>
            <input style={S.search} placeholder="Search movements…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0', marginBottom: 4 }}>
              <button style={catChip(!cat)} onClick={() => setCat(null)}>All</button>
              {CATS.map(c => <button key={c.key} style={catChip(cat === c.key)} onClick={() => setCat(c.key)}>{c.label}</button>)}
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '52vh' }}>
              {loading ? <p style={{ color: DIM, textAlign: 'center', padding: 20 }}>…</p> :
                all.map(ex => (
                  <button key={ex.exercise_id} style={S.pickRow} onClick={() => onPick(ex)}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 15, color: '#fff', fontWeight: 500 }}>{ex.name}</div>
                      {ex.theme_name && <div style={{ fontSize: 11, color: EMBER, fontStyle: 'italic' }}>{ex.theme_name}</div>}
                    </div>
                    <span style={S.catTag}>{CAT_LABEL[ex.category] || ex.category}{ex.is_custom ? ' ·' : ''}</span>
                  </button>
                ))}
              {!loading && all.length === 0 && <p style={{ color: MUTED, textAlign: 'center', padding: 20 }}>No movements found.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CustomExerciseForm({ rootId, onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('chest');
  const [logType, setLogType] = useState('weight_reps');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await api.forgeCreateExercise({ name: name.trim(), category: cat, log_type: logType }, rootId);
    setBusy(false);
    if (r.ok) onCreated(r.data);
  };
  return (
    <div>
      <label style={S.label}>Movement name</label>
      <input style={{ ...S.search, marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zercher Squat" autoFocus />
      <label style={S.label}>Muscle group</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CATS.map(c => <button key={c.key} style={catChip(cat === c.key)} onClick={() => setCat(c.key)}>{c.label}</button>)}
      </div>
      <label style={S.label}>Logged as</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {[['weight_reps', 'Weight × Reps'], ['reps', 'Reps'], ['duration', 'Duration'], ['distance', 'Distance']]
          .map(([k, l]) => <button key={k} style={catChip(logType === k)} onClick={() => setLogType(k)}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...S.primaryBtn, margin: 0, flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>Forge It</button>
        <button style={S.discardBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// REGIMEN BUILDER (modal)
// ══════════════════════════════════════════════════════════
function RegimenBuilder({ rootId, initial, openPicker, onClose, onSaved }) {
  const [name, setName] = useState(initial.name || '');
  const [theme, setTheme] = useState(initial.theme_title || '');
  const [exercises, setExercises] = useState(initial.exercises || []);
  const [busy, setBusy] = useState(false);

  const addEx = (ex) => setExercises(list => [...list, {
    exercise_id: ex.exercise_id, name: ex.name, theme_name: ex.theme_name,
    category: ex.category, target_sets: 3, target_reps: ex.log_type === 'weight_reps' ? 8 : undefined,
  }]);
  const removeEx = (i) => setExercises(list => list.filter((_, idx) => idx !== i));
  const setField = (i, k, v) => setExercises(list => list.map((e, idx) => idx === i ? { ...e, [k]: v } : e));

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const dto = {
      name: name.trim(), theme_title: theme.trim() || undefined,
      exercises: exercises.map(e => ({
        exercise_id: e.exercise_id,
        target_sets: e.target_sets ? Number(e.target_sets) : undefined,
        target_reps: e.target_reps ? Number(e.target_reps) : undefined,
      })),
    };
    const r = initial.regimen_id
      ? await api.forgeUpdateRegimen(initial.regimen_id, dto, rootId)
      : await api.forgeSaveRegimen(dto, rootId);
    setBusy(false);
    if (r.ok) onSaved();
  };

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modalSheet} onClick={e => e.stopPropagation()}>
        <div style={S.modalHandle} />
        <h3 style={{ fontFamily: FONT, fontSize: 20, color: '#fff', margin: '0 0 14px' }}>
          {initial.regimen_id ? 'Edit Regimen' : 'New Regimen'}
        </h3>
        <input style={{ ...S.search, marginBottom: 10 }} value={name} onChange={e => setName(e.target.value)} placeholder="Regimen name (e.g. Push Day)" />
        <input style={{ ...S.search, marginBottom: 14 }} value={theme} onChange={e => setTheme(e.target.value)} placeholder="Form title (optional, e.g. The Sundering Form)" />

        <div style={{ overflowY: 'auto', maxHeight: '40vh', marginBottom: 12 }}>
          {exercises.map((e, i) => (
            <div key={i} style={S.builderRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <label style={S.miniLabel}>Sets
                    <input type="number" value={e.target_sets ?? ''} onChange={ev => setField(i, 'target_sets', ev.target.value)} style={S.miniInput} />
                  </label>
                  <label style={S.miniLabel}>Reps
                    <input type="number" value={e.target_reps ?? ''} onChange={ev => setField(i, 'target_reps', ev.target.value)} style={S.miniInput} />
                  </label>
                </div>
              </div>
              <button style={S.rowDel} onClick={() => removeEx(i)}>{'✕'}</button>
            </div>
          ))}
          {exercises.length === 0 && <p style={{ color: MUTED, textAlign: 'center', padding: 16, fontSize: 13 }}>Add movements to this Form.</p>}
        </div>

        <button style={S.addExBtn} onClick={() => openPicker(addEx)}>+ Add Movement</button>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button style={{ ...S.primaryBtn, margin: 0, flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>Inscribe Regimen</button>
          <button style={S.discardBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// SUMMARY MODAL (after sealing)
// ══════════════════════════════════════════════════════════
function SummaryModal({ data, onClose }) {
  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={{ ...S.modalSheet, textAlign: 'center', paddingBottom: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 40, margin: '6px 0 4px' }}>{'⚒️'}</div>
        <h3 style={{ fontFamily: FONT, fontSize: 22, color: '#fff', margin: '0 0 4px' }}>Rite Sealed</h3>
        <p style={{ fontFamily: FONT, fontStyle: 'italic', color: DIM, fontSize: 14, margin: '0 0 18px', padding: '0 12px' }}>{data.message}</p>

        <div style={S.statGrid}>
          <Stat label="Duration" value={fmtDur(data.duration_sec)} />
          <Stat label="Volume" value={`${fmtVol(data.total_volume)} kg`} />
          <Stat label="Sets" value={data.working_sets} />
        </div>

        <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
          <div style={{ ...S.xpCard, borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: EMBER }}>+{data.fate_xp}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Fate XP{data.leveled_up ? ` · Lv ${data.fate_level}!` : ''}</div>
          </div>
          <div style={{ ...S.xpCard, borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: EMBER }}>+{data.forge_xp}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Forge XP</div>
          </div>
        </div>

        {data.new_feats?.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: EMBER, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{'★'} New Feats</div>
            {data.new_feats.map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: '#fff', padding: '2px 0' }}>
                {f.exercise} — <span style={{ color: EMBER }}>{REC_LABEL[f.record_type] || f.record_type}</span>
              </div>
            ))}
          </div>
        )}

        <button style={{ ...S.primaryBtn, margin: 0 }} onClick={onClose}>By the Veil, it is done</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// BOTTOM NAV
// ══════════════════════════════════════════════════════════
function BottomNav({ view, setView, hasActive }) {
  const items = [
    { key: 'train', icon: '⚒️', label: 'Forge' },
    { key: 'active', icon: '◉', label: 'Rite', show: hasActive },
    { key: 'history', icon: '☷', label: 'Chronicle' },
    { key: 'feats', icon: '★', label: 'Feats' },
  ].filter(i => i.show !== false);
  return (
    <div style={S.nav}>
      {items.map(i => (
        <button key={i.key} onClick={() => setView(i.key)}
          style={{ ...S.navBtn, color: view === i.key ? EMBER : MUTED }}>
          <span style={{ fontSize: 18 }}>{i.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600 }}>{i.label}</span>
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════
const catChip = (on) => ({
  padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
  background: on ? 'rgba(245,158,11,0.15)' : SURFACE2,
  border: `1px solid ${on ? 'rgba(245,158,11,0.4)' : BORDER}`,
  color: on ? EMBER : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B,
});

const S = {
  shell: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100vh', height: '100vh', background: BG, color: '#fff', fontFamily: FONT_B, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, zIndex: 20, flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', color: MUTED, fontSize: 20, cursor: 'pointer', width: 32, height: 32 },
  emberMark: { width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${EMBER}, ${EMBER_D})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  resumePill: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: EMBER, fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 16, cursor: 'pointer', fontFamily: FONT_B },
  page: { padding: '16px 16px 24px' },

  primaryBtn: { width: '100%', padding: '15px', borderRadius: 13, background: `linear-gradient(135deg, ${EMBER}, ${EMBER_D})`, border: 'none', color: '#1a1206', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, margin: '4px 0 18px', letterSpacing: '0.01em' },
  ghostBtn: { background: SURFACE2, border: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: FONT_B },
  discardBtn: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13, fontWeight: 600, padding: '0 16px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT_B },

  sectionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' },
  sectionTitle: { fontFamily: FONT, fontSize: 17, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '0.02em' },

  resumeCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 14, cursor: 'pointer' },
  resumeArrow: { fontSize: 22, color: EMBER },

  regimenCard: { display: 'flex', alignItems: 'center', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10 },
  startBtn: { background: `linear-gradient(135deg, ${EMBER}, ${EMBER_D})`, border: 'none', color: '#1a1206', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT_B },
  miniBtn: { background: SURFACE2, border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: FONT_B, flex: 1 },

  empty: { textAlign: 'center', padding: '28px 20px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 12 },

  metricBar: { display: 'flex', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '12px 0', marginBottom: 16 },

  exCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 12 },
  catTag: { fontSize: 10, color: MUTED, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 7px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  setHeadRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 6px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' },
  colCell: { flex: 1, textAlign: 'center' },
  setRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', position: 'relative' },
  setRowPr: { background: 'rgba(245,158,11,0.05)', borderRadius: 8 },
  setInput: { flex: 1, width: '100%', minWidth: 0, padding: '9px 4px', borderRadius: 9, background: SURFACE2, border: `1px solid ${BORDER}`, color: '#fff', fontSize: 15, textAlign: 'center', fontFamily: FONT_B, outline: 'none', boxSizing: 'border-box', fontWeight: 600 },
  setInputDone: { background: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.25)' },
  checkBtn: { width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: SURFACE2, border: `1px solid ${BORDER}`, color: GREEN, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  checkBtnOn: { background: 'rgba(34,197,94,0.18)', borderColor: 'rgba(34,197,94,0.5)' },
  rowDel: { width: 26, flexShrink: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: 13, cursor: 'pointer' },
  prFlag: { position: 'absolute', right: 64, fontSize: 9, fontWeight: 800, color: EMBER, background: 'rgba(245,158,11,0.15)', borderRadius: 5, padding: '1px 5px', letterSpacing: '0.05em' },
  addSetBtn: { width: '100%', marginTop: 8, padding: '9px', borderRadius: 9, background: 'transparent', border: `1px dashed ${BORDER}`, color: DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B },
  addExBtn: { width: '100%', padding: '12px', borderRadius: 12, background: SURFACE2, border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B },

  restBar: { position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 448, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(20,16,8,0.96)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 14, padding: '10px 16px', backdropFilter: 'blur(8px)', zIndex: 30 },
  restBtn: { background: SURFACE2, border: `1px solid ${BORDER}`, color: DIM, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: FONT_B },

  statGrid: { display: 'flex', gap: 8, marginBottom: 14 },
  statCell: { flex: 1, textAlign: 'center', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 4px' },
  histCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10 },

  chartCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 14 },
  featCard: { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 10 },
  featChip: { background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 },

  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', borderTop: `1px solid ${BORDER}`, background: 'rgba(8,8,15,0.97)', backdropFilter: 'blur(10px)', paddingBottom: 'env(safe-area-inset-bottom, 0)', zIndex: 25 },
  navBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '11px 0 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_B },

  modalWrap: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' },
  modalSheet: { width: '100%', maxWidth: 480, background: '#0d0d16', borderTop: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: '12px 16px 20px', maxHeight: '88vh', overflowY: 'auto' },
  modalHandle: { width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.15)', margin: '0 auto 14px' },
  search: { width: '100%', padding: '12px 14px', borderRadius: 11, background: SURFACE2, border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, fontFamily: FONT_B, outline: 'none', boxSizing: 'border-box' },
  pickRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', gap: 10 },
  label: { fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' },

  builderRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${BORDER}` },
  miniLabel: { fontSize: 10, color: MUTED, display: 'flex', flexDirection: 'column', gap: 3 },
  miniInput: { width: 56, padding: '6px', borderRadius: 8, background: SURFACE2, border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, textAlign: 'center', fontFamily: FONT_B, outline: 'none' },

  xpCard: { flex: 1, background: SURFACE, border: '1px solid', borderRadius: 12, padding: '12px 4px' },

  toast: { position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,16,8,0.97)', border: '1px solid rgba(245,158,11,0.3)', color: '#fff', fontSize: 13, padding: '10px 18px', borderRadius: 12, zIndex: 60, fontFamily: FONT_B, maxWidth: '90%', textAlign: 'center' },
};
