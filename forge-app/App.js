import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { colors } from './src/theme';
import api from './src/api';
import { saveSession, loadSession, clearSession } from './src/storage';
import LoginScreen from './src/screens/LoginScreen';
import HeroSelectScreen from './src/screens/HeroSelectScreen';
import ForgeMain from './src/ForgeMain';

// Root: bootstraps a persisted session, then routes through
// login → hero select → the Forge. Auth + identity are the
// Codex's (shared PIK backend); the Forge is just another client.
export default function App() {
  const [stage, setStage] = useState('boot'); // boot | login | hero | main
  const [auth, setAuth] = useState(null);      // { token, accountId, email, heroes }
  const [hero, setHero] = useState(null);

  // Restore a saved session on launch and validate it by listing heroes.
  useEffect(() => {
    (async () => {
      const saved = await loadSession();
      if (saved?.token) {
        api.setSession(saved.token, saved.rootId || '');
        const resp = await api.listHeroes();
        if (resp.ok) {
          const heroes = resp.data || [];
          const current = saved.rootId ? heroes.find((h) => h.root_id === saved.rootId) : null;
          if (current) {
            setAuth({ token: saved.token, heroes });
            setHero(current);
            setStage('main');
            return;
          }
          setAuth({ token: saved.token, heroes });
          setStage('hero');
          return;
        }
        await clearSession();
      }
      setStage('login');
    })();
  }, []);

  const handleAuthed = (a) => {
    api.setSession(a.token, '');
    setAuth(a);
    saveSession({ token: a.token });
    // One hero → skip the picker.
    if (a.heroes?.length === 1) {
      selectHero(a.heroes[0], a.token);
    } else {
      setStage('hero');
    }
  };

  const selectHero = async (h, token) => {
    api.setRootId(h.root_id);
    setHero(h);
    setStage('main');
    saveSession({ token: token || auth?.token, rootId: h.root_id });
  };

  const signOut = async () => {
    await api.accountLogout();
    await clearSession();
    api.clearSession();
    setAuth(null);
    setHero(null);
    setStage('login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />
      {stage === 'boot' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.ember} />
        </View>
      )}
      {stage === 'login' && <LoginScreen onAuthed={handleAuthed} />}
      {stage === 'hero' && (
        <HeroSelectScreen heroes={auth?.heroes || []} onSelected={(h) => selectHero(h)} onLogout={signOut} />
      )}
      {stage === 'main' && hero && <ForgeMain hero={hero} onSignOut={signOut} />}
    </View>
  );
}
