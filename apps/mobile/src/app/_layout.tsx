import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';
import { useColors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function Navigator() {
  const { ready, onboarded, error, retry } = useSession();
  const c = useColors();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        {error ? (
          <EmptyState
            title="Can't connect"
            message={`${error}\n\nStart it with "npm run api:dev" in the JobApp folder. (${API_URL})`}
            action={<Button title="Try again" onPress={retry} />}
          />
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: c.primary,
        headerTitleStyle: { color: c.text },
        headerStyle: { backgroundColor: c.background },
        contentStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="job/[id]" options={{ title: '' }} />
        <Stack.Screen name="editor" options={{ title: 'Tailor resume' }} />
        <Stack.Screen name="export" options={{ title: 'Preview & export' }} />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <Navigator />
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
