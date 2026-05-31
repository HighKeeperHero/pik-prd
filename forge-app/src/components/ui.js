// Reusable themed primitives for The Forge.
import React from 'react';
import { Text, Pressable, View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';

export function Btn({ title, onPress, kind = 'primary', disabled, busy, style }) {
  const base = [styles.btn, kindStyle[kind], disabled && styles.btnDisabled, style];
  const txt = [styles.btnText, kind === 'primary' && styles.btnTextPrimary, kind === 'danger' && styles.btnTextDanger, kind === 'ghost' && styles.btnTextGhost];
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [...base, pressed && !disabled && styles.pressed]}>
      {busy ? <ActivityIndicator color={kind === 'primary' ? '#1a1206' : colors.ember} /> : <Text style={txt}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function Empty({ title, sub }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Text style={{ color: colors.dim, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{sub}</Text> : null}
    </Card>
  );
}

export function StatCell({ label, value }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const kindStyle = {
  primary: { backgroundColor: colors.ember },
  ghost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
};

const styles = StyleSheet.create({
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  btnText: { fontSize: 15, fontWeight: '700' },
  btnTextPrimary: { color: '#1a1206' },
  btnTextDanger: { color: colors.red },
  btnTextGhost: { color: colors.dim },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginRight: 7 },
  chipActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)' },
  chipText: { color: colors.dim, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.ember },
  tag: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  statCell: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 },
  statValue: { color: colors.text, fontSize: 21, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
});
