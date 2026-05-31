import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { colors, radius, CATS, CAT_LABEL, LOG_TYPES } from '../theme';
import { Btn, Chip, Tag } from './ui';
import api from '../api';

// Bottom-sheet movement picker. Doubles as a custom-movement forge.
export default function ExercisePickerModal({ visible, title, onPick, onClose }) {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.forgeExercises({ category: cat || undefined, q: q || undefined });
    if (r.ok) setAll(r.data || []);
    setLoading(false);
  }, [cat, q]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(load, 180);
    return () => clearTimeout(t);
  }, [visible, load]);

  useEffect(() => { if (!visible) { setCreating(false); setQ(''); setCat(null); } }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headRow}>
          <Text style={styles.title}>{creating ? 'Forge a Movement' : title || 'Add a Movement'}</Text>
          {!creating
            ? <Btn title="+ Custom" kind="ghost" onPress={() => setCreating(true)} style={{ paddingVertical: 7, paddingHorizontal: 12 }} />
            : <Pressable onPress={() => setCreating(false)}><Text style={{ color: colors.dim }}>Cancel</Text></Pressable>}
        </View>

        {creating ? (
          <CustomForm onCreated={(ex) => { setCreating(false); onPick(ex); }} />
        ) : (
          <>
            <TextInput style={styles.search} value={q} onChangeText={setQ} placeholder="Search movements…" placeholderTextColor={colors.muted} autoCorrect={false} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10, flexGrow: 0 }}>
              <Chip label="All" active={!cat} onPress={() => setCat(null)} />
              {CATS.map((c) => <Chip key={c.key} label={c.label} active={cat === c.key} onPress={() => setCat(c.key)} />)}
            </ScrollView>
            {loading ? (
              <ActivityIndicator color={colors.ember} style={{ marginTop: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {all.map((ex) => (
                  <Pressable key={ex.exercise_id} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={() => onPick(ex)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      {ex.theme_name ? <Text style={styles.exTheme}>{ex.theme_name}</Text> : null}
                    </View>
                    <Tag label={(CAT_LABEL[ex.category] || ex.category) + (ex.is_custom ? ' •' : '')} />
                  </Pressable>
                ))}
                {all.length === 0 && <Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>No movements found.</Text>}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

function CustomForm({ onCreated }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('chest');
  const [logType, setLogType] = useState('weight_reps');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await api.forgeCreateExercise({ name: name.trim(), category: cat, log_type: logType });
    setBusy(false);
    if (r.ok) onCreated(r.data);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Movement name</Text>
      <TextInput style={styles.search} value={name} onChangeText={setName} placeholder="e.g. Zercher Squat" placeholderTextColor={colors.muted} />
      <Text style={styles.label}>Muscle group</Text>
      <View style={styles.wrapRow}>{CATS.map((c) => <Chip key={c.key} label={c.label} active={cat === c.key} onPress={() => setCat(c.key)} />)}</View>
      <Text style={styles.label}>Logged as</Text>
      <View style={styles.wrapRow}>{LOG_TYPES.map(([k, l]) => <Chip key={k} label={l} active={logType === k} onPress={() => setLogType(k)} />)}</View>
      <Btn title="Forge It" onPress={save} busy={busy} style={{ marginTop: 18 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#0d0d16', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.border, padding: 16, paddingBottom: 28, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 14 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  search: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  exName: { color: colors.text, fontSize: 15, fontWeight: '500' },
  exTheme: { color: colors.ember, fontSize: 11, fontStyle: 'italic', marginTop: 1 },
  label: { fontSize: 11, color: colors.dim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 14 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
});
