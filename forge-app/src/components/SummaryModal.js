import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { colors, radius, fmtDur, fmtVol, REC_LABEL } from '../theme';
import { Btn, StatCell } from './ui';

// Shown after sealing a rite — the payoff screen: totals, XP, new Feats.
export default function SummaryModal({ data, onClose }) {
  if (!data) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>⚒️</Text>
            <Text style={styles.title}>Rite Sealed</Text>
            <Text style={styles.msg}>{data.message}</Text>

            <View style={styles.statRow}>
              <StatCell label="Duration" value={fmtDur(data.duration_sec)} />
              <StatCell label="Volume" value={`${fmtVol(data.total_volume)} kg`} />
              <StatCell label="Sets" value={data.working_sets} />
            </View>

            <View style={styles.xpRow}>
              <View style={styles.xpCard}>
                <Text style={styles.xpVal}>+{data.fate_xp}</Text>
                <Text style={styles.xpLabel}>Fate XP{data.leveled_up ? ` · Lv ${data.fate_level}!` : ''}</Text>
              </View>
              <View style={styles.xpCard}>
                <Text style={styles.xpVal}>+{data.forge_xp}</Text>
                <Text style={styles.xpLabel}>Forge XP</Text>
              </View>
            </View>

            {data.new_feats?.length > 0 && (
              <View style={styles.feats}>
                <Text style={styles.featsHead}>★ New Feats</Text>
                {data.new_feats.map((f, i) => (
                  <Text key={i} style={styles.featLine}>
                    {f.exercise} — <Text style={{ color: colors.ember }}>{REC_LABEL[f.record_type] || f.record_type}</Text>
                  </Text>
                ))}
              </View>
            )}

            <Btn title="By the Veil, it is done" onPress={onClose} style={{ marginTop: 8, alignSelf: 'stretch' }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: '#0d0d16', borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 22, maxHeight: '86%' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  msg: { fontSize: 14, color: colors.dim, fontStyle: 'italic', textAlign: 'center', marginTop: 6, marginBottom: 18, paddingHorizontal: 8 },
  statRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  xpRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginVertical: 14 },
  xpCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  xpVal: { color: colors.ember, fontSize: 22, fontWeight: '800' },
  xpLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  feats: { alignSelf: 'stretch', backgroundColor: 'rgba(245,158,11,0.07)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: radius.md, padding: 12, marginBottom: 14 },
  featsHead: { color: colors.ember, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  featLine: { color: colors.text, fontSize: 13, paddingVertical: 2 },
});
