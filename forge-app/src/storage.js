// Persisted session — lets a hero stay signed in between launches.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'forge.session.v1';

export async function saveSession(session) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(session));
  } catch (e) {
    // Non-fatal: the app still works for the current launch.
  }
}

export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function clearSession() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
}
