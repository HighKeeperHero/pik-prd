import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, fmtVol, REC_LABEL, recValue } from '../theme';
import { Card, Empty } from '../components/ui';

// Personal records (Feats) + a weekly-volume bar chart.
export default function FeatsScreen({ records, stats }) {
  const weekly = stats?.weekly_volume || [];
  const max = Math.max(1, ...weekly.map((w) => w.volume));
  const byEx = {};
  for (const r of records) { (byEx[r.exercise] ||= []).push(r); }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {weekly.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <Text style={styles.chartTitle}>WEEKLY VOLUME</Text>
          <View style={styles.chart}>
            {weekly.map((w, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[styles.bar, { height: Math.max(4, (w.volume / max) * 78) }]} />
                <Text style={styles.barLabel}>{w.week_of.slice(5)}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {records.length === 0 && <Empty title="No Feats struck yet." sub="Seal a rite to set your first record." />}

      {Object.entries(byEx).map(([ex, recs]) => (
        <Card key={ex} style={{ marginBottom: 10 }}>
          <Text style={styles.exName}>{ex}</Text>
          <View style={styles.chips}>
            {recs.map((r) => (
              <View key={r.record_id} style={styles.chip}>
                <Text style={styles.chipLabel}>{REC_LABEL[r.record_type] || r.record_type}</Text>
                <Text style={styles.chipVal}>{recValue(r)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chartTitle: { color: colors.muted, fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 5 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '100%', backgroundColor: colors.ember, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barLabel: { color: colors.muted, fontSize: 8 },
  exName: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 11, minWidth: 92 },
  chipLabel: { color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipVal: { color: colors.ember, fontSize: 15, fontWeight: '800', marginTop: 2 },
});
