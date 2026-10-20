import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { lightTheme, darkTheme } from '../src/constants/theme';
import { getDatabase } from '../src/database/schema';
import { useSettingsStore } from '../src/stores/settingsStore';
import { View, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const systemScheme = useColorScheme();
  const { themeMode, isLoaded, loadSettings } = useSettingsStore();

  useEffect(() => {
    Promise.all([
      getDatabase(),
      loadSettings(),
    ]).then(() => setDbReady(true));
  }, []);

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const theme = isDark ? darkTheme : lightTheme;

  if (!dbReady || !isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: isDark ? '#121212' : '#F8F9FA' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
