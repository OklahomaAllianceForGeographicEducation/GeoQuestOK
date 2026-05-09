import { Stack, useRouter } from "expo-router"; // Use useRouter hook
import { useEffect } from "react";
import { supabase } from '../utils/supabase';
import { SafeAreaProvider } from 'react-native-safe-area-context';


export default function RootLayout() {
  const router = useRouter(); // Initialize the router hook INSIDE

  useEffect(() => {
    // This now lives inside the component safely
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    });

    // Cleanup the listener when the component unmounts
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <SafeAreaProvider>

      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="signup" options={{ title: 'Sign Up' }} />
      </Stack>
    </SafeAreaProvider>

  );
}
