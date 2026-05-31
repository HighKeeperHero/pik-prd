import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { colors, radius } from '../theme';
import { Btn, Card, Empty } from '../components/ui';

// Home: resume an in-flight rite, begin a new one, manage Regimens.
export default function TrainScreen({ session, regimens, onResume, onStartEmpty, onStartRegimen, onNewRegimen, onEditRegimen, onDeleteRegimen }) {
  const confirmDelete = (reg) =>
    Alert.alert('Archive Regimen', `Archive "${reg.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => onDeleteRegimen(reg.regimen_id) },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {session && (
        <Pressable onPress={onResume} style={styles.resume}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumeKicker}>RITE IN PROGRESS</Text>
            <Text style={styles.resumeName}>{session.name}</Text>
            <Text style={styles.resumeSub}>{session.exercises?.length || 0} movements logged</Text>
          </View>
          <Text style={{ color: colors.ember, fontSize: 22 }}>→</Text>
        </Pressable>
      )}

      <Btn title="⚒  Begin Empty Rite" onPress={onStartEmpty} disabled={!!session} style={{ marginTop: 4, marginBottom: 20 }} />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Regimens</Text>
        <Btn title="+ New" kind="ghost" onPress={onNewRegimen} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
      </View>

      {regimens.length === 0 && <Empty title="No Forms yet." sub="A Regimen is a saved routine — your repeatable path through the Forge." />}

      {regimens.map((reg) => (
        <Card key={reg.regimen_id} style={styles.regimen}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.regName}>{reg.name}</Text>
            {reg.theme_title ? <Text style={styles.regTheme}>{reg.theme_title}</Text> : null}
            <Text style={styles.regList} numberOfLines={1}>
              {reg.exercises?.map((e) => e.name).join(' · ') || 'Empty'}
            </Text>
          </View>
          <View style={{ gap: 6, marginLeft: 10 }}>
            <Btn title="Start" onPress={() => onStartRegimen(reg.regimen_id)} disabled={!!session} style={{ paddingVertical: 8, paddingHorizontal: 16 }} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable onPress={() => onEditRegimen(reg)} style={styles.mini}><Text style={styles.miniText}>Edit</Text></Pressable>
              <Pressable onPress={() => confirmDelete(reg)} style={styles.mini}><Text style={styles.miniText}>✕</Text></Pressable>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  resume: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: radius.lg, padding: 14, marginBottom: 14 },
  resumeKicker: { color: colors.ember, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  resumeName: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  resumeSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  regimen: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  regName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  regTheme: { color: colors.ember, fontSize: 12, fontStyle: 'italic', marginTop: 1 },
  regList: { color: colors.muted, fontSize: 12, marginTop: 4 },
  mini: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 5, alignItems: 'center' },
  miniText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
});
