import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, radius } from '../theme';
import { Btn } from '../components/ui';
import api from '../api';

const ALIGN_COLOR = { ORDER: '#3b82f6', CHAOS: '#ef4444', LIGHT: '#f5a623', DARK: '#8b5cf6', NONE: '#a78bfa' };

// Pick which hero this Forge session is bound to. Selecting a hero
// binds the account session to that rootId server-side; from there
// every workout flows into that hero's Fate XP and Forge pillar.
export default function HeroSelectScreen({ heroes, onSelected, onLogout }) {
  const [busyId, setBusyId] = useState(null);

  const pick = async (hero) => {
    setBusyId(hero.root_id);
    const resp = await api.selectHero(hero.root_id);
    setBusyId(null);
    if (resp.ok) onSelected(hero);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={styles.title}>Choose your Hero</Text>
      <Text style={styles.sub}>This Forge will be tempered in their name.</Text>

      {heroes.length === 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ color: colors.dim, textAlign: 'center', marginBottom: 16 }}>
            No heroes on this account yet. Create one in the Heroes' Veritas Codex app, then return here.
          </Text>
        </View>
      )}

      {heroes.map((h) => {
        const c = ALIGN_COLOR[h.fate_alignment] || ALIGN_COLOR.NONE;
        return (
          <Pressable key={h.root_id} onPress={() => pick(h)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
            <View style={[styles.avatar, { backgroundColor: c + '22', borderColor: c + '40' }]}>
              <Text style={{ fontSize: 22 }}>⚔️</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroName}>{h.hero_name}</Text>
              <Text style={styles.heroMeta}>
                <Text style={{ color: c, fontWeight: '700' }}>{h.fate_alignment}</Text>
                {`   Lv ${h.fate_level || 1}   ${(h.fate_xp || 0).toLocaleString()} XP`}
              </Text>
            </View>
            <Text style={{ color: colors.ember, fontSize: 18 }}>{busyId === h.root_id ? '…' : '→'}</Text>
          </Pressable>
        );
      })}

      <Btn title="Sign out" kind="ghost" onPress={onLogout} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  heroMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
