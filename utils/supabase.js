// utils/supabase.js
// Single Supabase client used everywhere in the app.

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail fast during startup if the environment variables are missing.
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

// Configure auth persistence for both web and native Expo runtimes.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
});

// Supabase's token auto-refresh timer only runs while this is told the app is
// foregrounded. Without it, a backgrounded/resumed native app can end up with a
// stale session whose auth-dependent requests (and onAuthStateChange listeners)
// silently hang instead of erroring, since the client has no valid token to
// refresh against. See: https://supabase.com/docs/reference/javascript/initializing#reactnative
AppState.addEventListener('change', (state) => {
    if (state === 'active') {
        supabase.auth.startAutoRefresh();
    } else {
        supabase.auth.stopAutoRefresh();
    }
});
