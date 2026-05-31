import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, fmtDur, fmtVol, fmtDate } from '../theme';
import { Card, Empty, StatCell } from '../components/ui';

// Sealed rites + lifetime totals — the hero's training Chronicle.
export default function HistoryScreen({ history, stats }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {stats && (
        <View style={styles.statRow}>
          <StatCell label="Rites" value={stats.total_sessions} />
          <StatCell label="Volume" value={`${(stats.total_volume / 1000).toFixed(1)}t`} />
          <StatCell label="Sets" value={stats.total_sets} />
          <StatCell label="Feats" value={stats.total_feats} />
        </View>
      )}

      {history.length === 0 && <Empty title="No rites sealed yet." sub="Finish a workout to begin your Chronicle." />}

      {history.map((h) => (
        <Card key={h.session_id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={styles.name}>{h.name}</Text>
            <Text style={styles.date}>{fmtDate(h.completed_at)}</Text>
          </View>
          <View style={styles.pills}>
            <Pill text={fmtDur(h.duration_sec)} />
            <Pill text={`${fmtVol(h.total_volume)} kg`} />
            <Pill text={`${h.total_sets} sets`} />
            {h.pr_count > 0 ? <Pill text={`★ ${h.pr_count} PR`} amber /> : null}
          </View>
          <View style={styles.divider} />
          {(h.exercises || []).map((e, i) => (
            <View key={i} style={styles.exLine}>
              <Text style={styles.exLabel}>{e.sets}× {e.name}</Text>
              {e.top_set ? <Text style={styles.exTop}>{e.top_set.weight} kg × {e.top_set.reps}</Text> : null}
            </View>
          ))}
          {h.fate_xp > 0 ? <Text style={styles.xp}>+{h.fate_xp} Fate XP · +{h.forge_xp} Forge XP</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function Pill({ text, amber }) {
  return <Text style={[styles.pill, amber && { color: colors.ember }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  date: { color: colors.muted, fontSize: 12 },
  pills: { flexDirection: 'row', gap: 14, marginVertical: 8 },
  pill: { color: colors.dim, fontSize: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 8, paddingTop: 0 },
  exLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  exLabel: { color: colors.dim, fontSize: 13 },
  exTop: { color: colors.muted, fontSize: 13 },
  xp: { color: colors.ember, fontSize: 12, marginTop: 8 },
});
