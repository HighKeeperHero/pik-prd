import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { colors, radius } from '../theme';
import { Btn } from '../components/ui';
import api from '../api';

// Sign in with an existing Heroes' Veritas (Codex) account, or create one.
// The Forge shares the same FateAccount identity as the game.
export default function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setBusy(true);
    const resp = mode === 'login'
      ? await api.accountLogin(email.trim().toLowerCase(), password)
      : await api.accountRegister(email.trim().toLowerCase(), password, displayName.trim() || undefined);
    setBusy(false);
    if (resp.ok && resp.data?.session_token) {
      onAuthed({
        token: resp.data.session_token,
        accountId: resp.data.account_id,
        email: resp.data.email,
        heroes: resp.data.heroes || [],
      });
    } else {
      setError(resp.error || 'Sign-in failed. Check your credentials.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}><Text style={{ fontSize: 34 }}>⚒️</Text></View>
        <Text style={styles.title}>The Forge</Text>
        <Text style={styles.sub}>Temper the body. Heroes' Veritas.</Text>

        {error ? <View style={styles.errBox}><Text style={styles.errText}>{error}</Text></View> : null}

        {mode === 'register' && (
          <>
            <Text style={styles.label}>Display name (optional)</Text>
            <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={colors.muted} />
          </>
        )}
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.muted} secureTextEntry />

        <Btn title={mode === 'login' ? 'Enter the Forge' : 'Create Account'} onPress={submit} busy={busy} style={{ marginTop: 18 }} />

        <Text style={styles.switch} onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
          {mode === 'login' ? "No account yet? Create one" : 'Already have an account? Sign in'}
        </Text>
        <Text style={styles.note}>Your Codex hero and progression carry over — workouts earn Fate XP and temper the Forge pillar.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  mark: { width: 68, height: 68, borderRadius: 18, backgroundColor: colors.ember, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  label: { fontSize: 11, color: colors.dim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15 },
  errBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: radius.sm, padding: 10, marginBottom: 6 },
  errText: { color: colors.red, fontSize: 13, textAlign: 'center' },
  switch: { color: colors.ember, fontSize: 13, textAlign: 'center', marginTop: 18, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 22, lineHeight: 18 },
});
