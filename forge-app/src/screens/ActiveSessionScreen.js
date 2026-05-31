import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { colors, radius, fmtClock, fmtVol, CAT_LABEL } from '../theme';
import { Btn, Tag } from '../components/ui';
import api from '../api';

const REST_DEFAULT = 120;

// The live workout. Logs sets exercise-by-exercise, runs a workout
// clock and a per-set rest timer, then seals the rite.
export default function ActiveSessionScreen({ session, onRefresh, onAddExercise, onFinish, onDiscard }) {
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(null); // seconds remaining or null
  const [finishing, setFinishing] = useState(false);
  const startRef = useRef(session ? new Date(session.started_at).getTime() : Date.now());

  useEffect(() => { startRef.current = session ? new Date(session.started_at).getTime() : Date.now(); }, [session?.session_id]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rest == null) return;
    if (rest <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  if (!session) return null;

  const exercises = session.exercises || [];
  const volume = exercises.reduce(
    (acc, se) => acc + (se.sets || []).reduce((a, s) => a + (s.completed && !s.is_warmup && s.weight && s.reps ? s.weight * s.reps : 0), 0),
    0,
  );
  const doneSets = exercises.reduce((a, se) => a + (se.sets || []).filter((s) => s.completed).length, 0);

  const seal = async () => {
    setFinishing(true);
    await onFinish();
    setFinishing(false);
  };
  const confirmDiscard = () =>
    Alert.alert('Discard Rite', 'Discard this rite? Nothing will be recorded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.metricBar}>
          <Metric label="Time" value={fmtClock(elapsed)} />
          <Metric label="Volume" value={`${fmtVol(volume)} kg`} />
          <Metric label="Sets" value={String(doneSets)} />
        </View>

        {exercises.map((se) => (
          <ExerciseCard
            key={se.session_exercise_id}
            sessionId={session.session_id}
            se={se}
            onRefresh={onRefresh}
            onSetCompleted={() => setRest(REST_DEFAULT)}
          />
        ))}

        <Btn title="+ Add Movement" kind="ghost" onPress={onAddExercise} style={{ marginTop: 4 }} />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Btn title={finishing ? 'Sealing…' : 'Seal the Rite'} onPress={seal} busy={finishing} style={{ flex: 2 }} />
          <Btn title="Discard" kind="danger" onPress={confirmDiscard} style={{ flex: 1 }} />
        </View>
      </ScrollView>

      {rest != null && (
        <View style={styles.restBar}>
          <Text style={{ color: colors.dim, fontSize: 13 }}>Rest</Text>
          <Text style={styles.restClock}>{fmtClock(rest)}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable onPress={() => setRest((r) => (r || 0) + 15)} style={styles.restBtn}><Text style={styles.restBtnText}>+15s</Text></Pressable>
            <Pressable onPress={() => setRest(null)} style={styles.restBtn}><Text style={styles.restBtnText}>Skip</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function ExerciseCard({ sessionId, se, onRefresh, onSetCompleted }) {
  const lt = se.log_type || 'weight_reps';
  const sets = se.sets || [];

  const addSet = async () => {
    const last = sets[sets.length - 1];
    await api.forgeLogSet(sessionId, {
      session_exercise_id: se.session_exercise_id,
      weight: last?.weight ?? undefined,
      reps: last?.reps ?? undefined,
      completed: false,
    });
    onRefresh();
  };

  return (
    <View style={styles.exCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.exName}>{se.name}</Text>
          {se.theme_name ? <Text style={styles.exTheme}>{se.theme_name}</Text> : null}
        </View>
        <Tag label={CAT_LABEL[se.category] || se.category} />
      </View>

      <View style={styles.headRow}>
        <Text style={[styles.headCell, { width: 30 }]}>SET</Text>
        {lt === 'weight_reps' && <><Text style={[styles.headCell, styles.flex1]}>KG</Text><Text style={[styles.headCell, styles.flex1]}>REPS</Text></>}
        {lt === 'reps' && <Text style={[styles.headCell, styles.flex2]}>REPS</Text>}
        {lt === 'duration' && <Text style={[styles.headCell, styles.flex2]}>SECONDS</Text>}
        {lt === 'distance' && <Text style={[styles.headCell, styles.flex2]}>METERS</Text>}
        <View style={{ width: 70 }} />
      </View>

      {sets.map((s, i) => (
        <SetRow key={s.set_id} set={s} index={i} logType={lt} onRefresh={onRefresh} onSetCompleted={onSetCompleted} />
      ))}

      <Pressable onPress={addSet} style={styles.addSet}><Text style={styles.addSetText}>+ Add Set</Text></Pressable>
    </View>
  );
}

function SetRow({ set, index, logType, onRefresh, onSetCompleted }) {
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : '');
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [dur, setDur] = useState(set.duration_sec != null ? String(set.duration_sec) : '');
  const [dist, setDist] = useState(set.distance_m != null ? String(set.distance_m) : '');
  const [done, setDone] = useState(set.completed);

  useEffect(() => { setDone(set.completed); }, [set.completed]);

  const num = (v) => (v === '' ? undefined : Number(v));
  const persist = (extra) => api.forgeUpdateSet(set.set_id, {
    weight: num(weight), reps: num(reps), duration_sec: num(dur), distance_m: num(dist), ...extra,
  });

  const toggle = async () => {
    const next = !done;
    setDone(next);
    await persist({ completed: next });
    if (next) onSetCompleted();
  };
  const remove = async () => { await api.forgeDeleteSet(set.set_id); onRefresh(); };

  const cell = (val, setter) => (
    <TextInput
      value={val}
      onChangeText={setter}
      onBlur={() => persist({})}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={colors.faint}
      style={[styles.setInput, done && styles.setInputDone]}
    />
  );

  return (
    <View style={[styles.setRow, set.is_pr && styles.setRowPr]}>
      <Text style={[styles.setNum, { color: set.is_warmup ? colors.ember : colors.dim }]}>{set.is_warmup ? 'W' : index + 1}</Text>
      {logType === 'weight_reps' && <><View style={styles.flex1}>{cell(weight, setWeight)}</View><View style={styles.flex1}>{cell(reps, setReps)}</View></>}
      {logType === 'reps' && <View style={styles.flex2}>{cell(reps, setReps)}</View>}
      {logType === 'duration' && <View style={styles.flex2}>{cell(dur, setDur)}</View>}
      {logType === 'distance' && <View style={styles.flex2}>{cell(dist, setDist)}</View>}
      {set.is_pr ? <Text style={styles.prFlag}>PR</Text> : null}
      <Pressable onPress={toggle} style={[styles.check, done && styles.checkOn]}><Text style={{ color: colors.green, fontSize: 16 }}>{done ? '✓' : ''}</Text></Pressable>
      <Pressable onPress={remove} hitSlop={8} style={{ width: 24, alignItems: 'center' }}><Text style={{ color: colors.faint, fontSize: 13 }}>✕</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  metricBar: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 12, marginBottom: 16 },
  exCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  exName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  exTheme: { color: colors.ember, fontSize: 11, fontStyle: 'italic' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  headCell: { color: colors.muted, fontSize: 10, letterSpacing: 0.6, textAlign: 'center' },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  setRowPr: { backgroundColor: 'rgba(245,158,11,0.05)', borderRadius: radius.sm },
  setNum: { width: 30, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  setInput: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 9, color: colors.text, fontSize: 15, textAlign: 'center', fontWeight: '600' },
  setInputDone: { backgroundColor: 'rgba(34,197,94,0.07)', borderColor: 'rgba(34,197,94,0.25)' },
  check: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: 'rgba(34,197,94,0.18)', borderColor: 'rgba(34,197,94,0.5)' },
  prFlag: { color: colors.ember, fontSize: 9, fontWeight: '800', backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  addSet: { marginTop: 8, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center' },
  addSetText: { color: colors.dim, fontSize: 13, fontWeight: '600' },
  restBar: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,16,8,0.97)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 16 },
  restClock: { color: colors.ember, fontSize: 22, fontWeight: '800' },
  restBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 11 },
  restBtnText: { color: colors.dim, fontSize: 12, fontWeight: '600' },
});
