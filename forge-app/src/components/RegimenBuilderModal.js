import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { colors, radius } from '../theme';
import { Btn } from './ui';
import api from '../api';

// Build or edit a Regimen (routine). Exercises are added via the shared
// ExercisePicker, surfaced by the parent through `requestPick`.
export default function RegimenBuilderModal({ visible, initial, requestPick, onSaved, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [theme, setTheme] = useState(initial?.theme_title || '');
  const [exercises, setExercises] = useState(initial?.exercises || []);
  const [busy, setBusy] = useState(false);

  // Reset local state whenever a different regimen is opened.
  React.useEffect(() => {
    if (visible) {
      setName(initial?.name || '');
      setTheme(initial?.theme_title || '');
      setExercises(initial?.exercises || []);
    }
  }, [visible, initial]);

  const addEx = (ex) => setExercises((list) => [...list, {
    exercise_id: ex.exercise_id, name: ex.name, theme_name: ex.theme_name,
    category: ex.category, target_sets: 3, target_reps: ex.log_type === 'weight_reps' ? 8 : undefined,
  }]);
  const removeEx = (i) => setExercises((list) => list.filter((_, idx) => idx !== i));
  const setField = (i, k, v) => setExercises((list) => list.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)));

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const dto = {
      name: name.trim(),
      theme_title: theme.trim() || undefined,
      exercises: exercises.map((e) => ({
        exercise_id: e.exercise_id,
        target_sets: e.target_sets ? Number(e.target_sets) : undefined,
        target_reps: e.target_reps ? Number(e.target_reps) : undefined,
      })),
    };
    const r = initial?.regimen_id ? await api.forgeUpdateRegimen(initial.regimen_id, dto) : await api.forgeSaveRegimen(dto);
    setBusy(false);
    if (r.ok) onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{initial?.regimen_id ? 'Edit Regimen' : 'New Regimen'}</Text>

        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Regimen name (e.g. Push Day)" placeholderTextColor={colors.muted} />
        <TextInput style={[styles.input, { marginTop: 10 }]} value={theme} onChangeText={setTheme} placeholder="Form title (optional, e.g. The Sundering Form)" placeholderTextColor={colors.muted} />

        <ScrollView style={{ maxHeight: 320, marginTop: 14 }} keyboardShouldPersistTaps="handled">
          {exercises.map((e, i) => (
            <View key={`${e.exercise_id}-${i}`} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <Field label="Sets" value={e.target_sets} onChange={(v) => setField(i, 'target_sets', v)} />
                  <Field label="Reps" value={e.target_reps} onChange={(v) => setField(i, 'target_reps', v)} />
                </View>
              </View>
              <Pressable onPress={() => removeEx(i)} hitSlop={10}><Text style={{ color: colors.faint, fontSize: 16 }}>✕</Text></Pressable>
            </View>
          ))}
          {exercises.length === 0 && <Text style={{ color: colors.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>Add movements to this Form.</Text>}
        </ScrollView>

        <Btn title="+ Add Movement" kind="ghost" onPress={() => requestPick(addEx)} style={{ marginTop: 12 }} />
        <Btn title="Inscribe Regimen" onPress={save} busy={busy} style={{ marginTop: 10 }} />
      </View>
    </Modal>
  );
}

function Field({ label, value, onChange }) {
  return (
    <View>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput
        style={styles.miniInput}
        value={value != null ? String(value) : ''}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={colors.faint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#0d0d16', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.border, padding: 16, paddingBottom: 28, maxHeight: '92%' },
  handle: { width: 40, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 14 },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  exName: { color: colors.text, fontSize: 14, fontWeight: '500' },
  miniLabel: { color: colors.muted, fontSize: 10 },
  miniInput: { width: 58, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 6, color: colors.text, fontSize: 14, textAlign: 'center', marginTop: 3 },
});
