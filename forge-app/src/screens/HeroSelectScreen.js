import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, radius } from '../theme';
import { Btn } from '../components/ui';
import api from '../api';

const ALIGN_COLOR = { ORDER: '#3b82f6', CHAOS: '#ef4444', LIGHT: '#f5a623', DARK: '#8b5cf6', NONE: '#a78bfa' };

// Pick which hero this Forge session is bound to. Selecting a hero
// binds the account session to that rootId server-side; from there
// every workout flows into that hero's Fate XP and Forge pillar.
// A brand-new account (no heroes yet) can forge its first hero here.
export default function HeroSelectScreen({ heroes, onSelected, onLogout }) {
  const [list, setList] = useState(heroes || []);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState((heroes || []).length === 0);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const pick = async (hero) => {
    setBusyId(hero.root_id);
    const resp = await api.selectHero(hero.root_id);
    setBusyId(null);
    if (resp.ok) onSelected(hero);
    else setError(resp.error || 'Could not select hero.');
  };

  const create = async () => {
    if (name.trim().length < 2) { setError('Hero name must be at least 2 characters.'); return; }
    setBusyId('new');
    setError(null);
    const resp = await api.createHero(name.trim());
    setBusyId(null);
    if (resp.ok && resp.data?.root_id) {
      setList((l) => [...l, resp.data]);
      setCreating(false);
      setName('');
      pick(resp.data);
    } else {
      setError(resp.error || 'Could not create hero (name may be taken).');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text style={styles.title}>Choose your Hero</Text>
      <Text style={styles.sub}>This Forge will be tempered in their name.</Text>

      {error ? <View style={styles.errBox}><Text style={styles.errText}>{error}</Text></View> : null}

      {list.map((h) => {
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

      {creating ? (
        <View style={styles.createBox}>
          <Text style={styles.createLabel}>{list.length === 0 ? 'Forge your first hero' : 'New hero name'}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Hero name"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Btn title="Forge Hero" onPress={create} busy={busyId === 'new'} style={{ flex: 1 }} />
            {list.length > 0 && <Btn title="Cancel" kind="ghost" onPress={() => { setCreating(false); setError(null); }} style={{ flex: 1 }} />}
          </View>
        </View>
      ) : (
        <Btn title="+ Forge a new Hero" kind="ghost" onPress={() => setCreating(true)} style={{ marginTop: 8 }} />
      )}

      <Btn title="Sign out" kind="ghost" onPress={onLogout} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 24 },
  errBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: radius.sm, padding: 10, marginBottom: 14 },
  errText: { color: colors.red, fontSize: 13, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  heroMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  createBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginTop: 8 },
  createLabel: { color: colors.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 },
});
