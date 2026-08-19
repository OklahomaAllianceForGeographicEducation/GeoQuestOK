// app/_layout.tsx
// This is the ROOT layout for the entire app. In Expo Router, any file
// named "_layout.tsx" wraps every screen inside its folder (and all
// subfolders). Because this one lives directly in app/, it wraps literally
// every screen in the whole application — it's the very first thing that
// runs and the outermost wrapper around everything else.

// Types (TypeScript-only, no runtime code) describing the shape of the
// event name and session object Supabase gives us when auth state changes.
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

// "Slot" is Expo Router's placeholder for "render whichever child route is
// currently active here." Because this layout doesn't wrap Slot in a
// Stack/Tabs navigator, it doesn't add any navigation UI (no header, no tab
// bar) of its own — it just renders the matched screen directly and lets
// nested layouts (like app/(tabs)/_layout.tsx) provide their own
// navigation chrome.
// "useRouter" is a hook that gives us an object with navigation methods
// like .replace() and .push() so we can move the user between screens from
// code (not just by tapping a Link).
import { Slot, useRouter } from 'expo-router';

// "useEffect" is a React hook that runs a function after the component
// renders, and optionally again whenever specified values change. Here it's
// used to run exactly once when the app first loads (see the empty [] at
// the end of the useEffect call below).
import { useEffect } from 'react';

// Wraps the app so that components can find out how much space is taken up
// by device notches, status bars, and home indicators (safe areas), which
// is important on phones like iPhones with a notch/Dynamic Island.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// A custom app component (from components/BadgeUnlockProvider.tsx) that
// presumably listens for "you unlocked a badge!" events somewhere in the
// app and shows a popup/animation for them, no matter which screen is
// active. Wrapping the whole app in it means that popup can appear over
// any screen.
import BadgeUnlockProvider from '../components/BadgeUnlockProvider';

// Our configured Supabase client (from utils/supabase.js) — this is the
// object used to talk to the Supabase backend (auth, database, etc.).
import { supabase } from '../utils/supabase';

// "export default" — this function is what Expo Router renders as the
// root wrapper for the whole app.
export default function RootLayout() {
  // Grab the navigation object so we can redirect the user based on their
  // login/role status.
  const router = useRouter();

  // useEffect with an empty dependency array ([] at the very end) runs its
  // function exactly once, right after this component first mounts (i.e.
  // once when the app starts up) — not on every re-render.
  useEffect(() => {
    // supabase.auth.onAuthStateChange registers a listener that Supabase
    // calls every time the user's login state changes: on initial load,
    // on sign in, on sign out, on token refresh, etc. It returns an object
    // containing `data.subscription`, which we can later use to stop
    // listening (see the cleanup function below).
    // We destructure `{ data: { subscription } }` to reach directly into
    // that nested `subscription` object.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      // TEMP DIAGNOSTIC LOGGING -- logs every event this listener receives,
      // even ones the guard below ignores, so we can see exactly what
      // Supabase fires around a sign-out/sign-up instead of guessing.
      console.log('[authStateChange]', event, 'session user:', session?.user?.id ?? null);

      // Only navigate on events that represent an actual sign-in/sign-out
      // transition. Supabase also fires this callback for TOKEN_REFRESHED
      // (a periodic background timer, unrelated to navigation intent) and
      // USER_UPDATED -- both carry a non-null session, so without this
      // guard they'd trigger the exact same role-based redirect below.
      // That's how a sign-out could get silently undone: a refresh timer
      // scheduled against the OLD session firing moments after signOut(),
      // delivering a stale-but-non-null session snapshot that forces a
      // redirect straight back into the app right after the explicit
      // logout navigation.
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') {
        return;
      }

      // `session` is either null (nobody logged in) or an object
      // containing the logged-in user's info and auth tokens.

      // "session?.user" uses optional chaining: if `session` is null, the
      // whole expression short-circuits to `undefined` instead of
      // throwing an error trying to read `.user` off of null.
      if (session?.user) {
        try {
          // Look up this user's profile row in the "profiles" table to
          // find out what role they have (student / okage / teacher),
          // since that determines which part of the app to send them to.
          const { data: profile } = await supabase
            .from('profiles')          // target the "profiles" table
            .select('app_role')        // only fetch the app_role column (saves bandwidth)
            .eq('id', session.user.id) // WHERE id = the logged-in user's id
            .single();                 // expect exactly one row back, not an array

          // Route the user to the correct section of the app based on
          // their role. router.replace() (as opposed to router.push())
          // swaps the current screen instead of stacking a new one on top,
          // so the user can't tap "back" and end up on a blank/loading
          // screen.
          if (profile?.app_role === 'student') {
            router.replace('/(tabs)/dashboard');
          } else if (profile?.app_role === 'okage') {
            // "as any" tells TypeScript to stop type-checking this string
            // against the app's known route list. It's used here because
            // TypeScript's generated route types don't recognize this
            // path — a workaround rather than an ideal fix.
            router.replace('/(okage-tabs)' as any);
          } else {
            // Anyone who isn't a student or okage falls through to the
            // teacher section by default.
            router.replace('/(teacher-tabs)');
          }
        } catch (err) {
          // If the profile lookup fails for any reason (network error,
          // missing row, etc.), fall back to sending the user to the root
          // route ("/") rather than leaving them stuck.
          router.replace('/');
        }
      } else if (event === 'SIGNED_OUT') {
        // Explicit sign-out: leave whatever authenticated screen was
        // showing and go back to the root launch screen.
        router.replace('/');
      }
      // No session on INITIAL_SESSION (a fresh page load): do nothing.
      // The visitor may have navigated straight to a public page --
      // /login, /signup, /teachers, /reset-password -- and none of those
      // assume a session exists. Force-redirecting every one of them to
      // '/' here would silently break direct links to any public page
      // other than the root.
    });

    // The function returned from useEffect is a "cleanup function" — React
    // runs it when this component unmounts. Here it unsubscribes from the
    // auth listener so it doesn't keep firing (and potentially cause
    // memory leaks or duplicate redirects) after the root layout goes away.
    return () => subscription.unsubscribe();
  }, []); // Empty array = run this effect once, on first mount only.

  // Wrap the Slot with SafeAreaProvider
  return (
    // SafeAreaProvider makes safe-area measurements (notch/status bar/home
    // indicator sizes) available to any component further down the tree
    // that asks for them (e.g. via useSafeAreaInsets()).
    <SafeAreaProvider>
      {/* GestureHandlerRootView here, once, means any screen under Slot
          (e.g. the swipe-back edge gestures on the Classes/Curriculum
          teacher screens) can use react-native-gesture-handler without
          wrapping itself individually. The one exception is content
          rendered inside a plain React Native <Modal> (like
          FullLessonPlanModal) — Modal renders on its own separate native
          surface, disconnected from this tree, so that component still
          needs its own local GestureHandlerRootView. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* BadgeUnlockProvider wraps every screen so its badge-unlock popup
            can appear regardless of which screen is currently showing. */}
        <BadgeUnlockProvider>
          {/* Slot renders whatever child route currently matches the URL —
              this is where every actual screen in the app ultimately gets
              displayed. */}
          <Slot />
        </BadgeUnlockProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
