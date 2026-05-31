import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, SafeAreaView } from 'react-native';
import { colors } from './theme';
import api from './api';
import TrainScreen from './screens/TrainScreen';
import ActiveSessionScreen from './screens/ActiveSessionScreen';
import HistoryScreen from './screens/HistoryScreen';
import FeatsScreen from './screens/FeatsScreen';
import ExercisePickerModal from './components/ExercisePickerModal';
import RegimenBuilderModal from './components/RegimenBuilderModal';
import SummaryModal from './components/SummaryModal';

// The signed-in experience: tabbed Forge with a live session, modals,
// and data loading. Bound to one hero (rootId already set on the api).
export default function ForgeMain({ hero, onSignOut }) {
  const [view, setView] = useState('train'); // train | active | history | feats
  const [session, setSession] = useState(null);
  const [regimens, setRegimens] = useState([]);
  const [history, setHistory] = useState([]);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [picker, setPicker] = useState({ visible: false });
  const [builder, setBuilder] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [act, regs] = await Promise.all([api.forgeActiveSession(), api.forgeRegimens()]);
      if (!alive) return;
      if (act.ok && act.data) setSession(act.data);
      if (regs.ok) setRegimens(regs.data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const reloadRegimens = useCallback(async () => {
    const r = await api.forgeRegimens();
    if (r.ok) setRegimens(r.data || []);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!session?.session_id) return;
    const r = await api.forgeSession(session.session_id);
    if (r.ok) setSession(r.data);
  }, [session?.session_id]);

  useEffect(() => {
    if (view === 'history') {
      api.forgeHistory(30).then((r) => r.ok && setHistory(r.data || []));
      api.forgeStats().then((r) => r.ok && setStats(r.data));
    } else if (view === 'feats') {
      api.forgeRecords().then((r) => r.ok && setRecords(r.data || []));
      api.forgeStats().then((r) => r.ok && setStats(r.data));
    }
  }, [view]);

  // ── session lifecycle ──
  const startSession = async (regimenId) => {
    const r = await api.forgeStartSession(regimenId ? { regimen_id: regimenId } : {});
    if (r.ok) { setSession(r.data); setView('active'); }
  };
  const finishSession = async () => {
    if (!session) return;
    const r = await api.forgeFinishSession(session.session_id, {});
    if (r.ok) { setSummary(r.data); setSession(null); setView('train'); }
  };
  const discardSession = async () => {
    if (!session) return;
    await api.forgeDiscardSession(session.session_id);
    setSession(null);
    setView('train');
  };

  // ── shared picker plumbing ──
  const openSessionPicker = () =>
    setPicker({
      visible: true,
      title: 'Add a Movement',
      onPick: async (ex) => {
        const r = await api.forgeAddExercise(session.session_id, ex.exercise_id);
        if (r.ok) setSession(r.data);
        setPicker({ visible: false });
      },
    });
  const requestPickForBuilder = (cb) =>
    setPicker({
      visible: true,
      title: 'Add to Regimen',
      onPick: (ex) => { cb(ex); setPicker({ visible: false }); },
    });

  const tabs = [
    { key: 'train', icon: '⚒', label: 'Forge' },
    { key: 'active', icon: '◉', label: 'Rite', show: !!session },
    { key: 'history', icon: '☷', label: 'Chronicle' },
    { key: 'feats', icon: '★', label: 'Feats' },
  ].filter((t) => t.show !== false);

  const titleByView = { train: 'The Forge', active: 'Forge Rite', history: 'Chronicle', feats: 'Feats' };

  return (
    <SafeAreaView style={styles.shell}>
      {/* header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={styles.mark}><Text style={{ fontSize: 15 }}>⚒️</Text></View>
          <View>
            <Text style={styles.hTitle}>{titleByView[view]}</Text>
            <Text style={styles.hHero}>{hero?.hero_name}</Text>
          </View>
        </View>
        <Pressable onPress={onSignOut} hitSlop={10}><Text style={styles.signOut}>Sign out</Text></Pressable>
      </View>

      {/* body */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.ember} /><Text style={styles.loadingText}>Stoking the Forge…</Text></View>
        ) : view === 'train' ? (
          <TrainScreen
            session={session}
            regimens={regimens}
            onResume={() => setView('active')}
            onStartEmpty={() => startSession(null)}
            onStartRegimen={startSession}
            onNewRegimen={() => setBuilder({ name: '', exercises: [] })}
            onEditRegimen={(reg) => setBuilder({
              regimen_id: reg.regimen_id, name: reg.name, theme_title: reg.theme_title,
              exercises: (reg.exercises || []).map((e) => ({
                exercise_id: e.exercise_id, name: e.name, theme_name: e.theme_name,
                category: e.category, target_sets: e.target_sets, target_reps: e.target_reps, log_type: e.log_type,
              })),
            })}
            onDeleteRegimen={async (id) => { await api.forgeDeleteRegimen(id); reloadRegimens(); }}
          />
        ) : view === 'active' ? (
          <ActiveSessionScreen
            session={session}
            onRefresh={refreshSession}
            onAddExercise={openSessionPicker}
            onFinish={finishSession}
            onDiscard={discardSession}
          />
        ) : view === 'history' ? (
          <HistoryScreen history={history} stats={stats} />
        ) : (
          <FeatsScreen records={records} stats={stats} />
        )}
      </View>

      {/* bottom nav */}
      <View style={styles.nav}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setView(t.key)} style={styles.navBtn}>
            <Text style={{ fontSize: 18, color: view === t.key ? colors.ember : colors.muted }}>{t.icon}</Text>
            <Text style={[styles.navLabel, { color: view === t.key ? colors.ember : colors.muted }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* modals */}
      <ExercisePickerModal
        visible={picker.visible}
        title={picker.title}
        onPick={picker.onPick || (() => {})}
        onClose={() => setPicker({ visible: false })}
      />
      <RegimenBuilderModal
        visible={!!builder}
        initial={builder}
        requestPick={requestPickForBuilder}
        onClose={() => setBuilder(null)}
        onSaved={() => { setBuilder(null); reloadRegimens(); }}
      />
      {summary && <SummaryModal data={summary} onClose={() => setSummary(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  mark: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },
  hTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hHero: { color: colors.muted, fontSize: 11 },
  signOut: { color: colors.muted, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.dim, fontSize: 13 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'rgba(8,8,15,0.98)' },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  navLabel: { fontSize: 10, fontWeight: '600' },
});
