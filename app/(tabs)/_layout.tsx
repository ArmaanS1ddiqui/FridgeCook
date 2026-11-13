import { Tabs } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useNetwork } from '../../src/hooks/useNetwork';
import { promptForBackupFolderIfNeeded } from '../../src/services/autoBackup';
import { reloadAllStores } from '../../src/services/reloadStores';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function OfflineBanner() {
  const theme = useTheme();
  return (
    <View style={[styles.offlineBanner, { backgroundColor: theme.colors.error }]}>
      <MaterialCommunityIcons name="wifi-off" size={14} color={theme.colors.onError} />
      <Text style={[styles.offlineText, { color: theme.colors.onError }]}>No Internet</Text>
    </View>
  );
}

export default function TabLayout() {
  const theme = useTheme();
  const { isConnected } = useNetwork();

  // New install or reinstall: offer to connect the FridgeCook backup folder
  // (and restore from it), or say so if a connected folder has disappeared.
  useEffect(() => {
    const timer = setTimeout(() => { promptForBackupFolderIfNeeded(reloadAllStores).catch(() => {}); }, 800);
    return () => clearTimeout(timer);
  }, []);
  // Keep labels clear of the system navigation bar (3-button or gesture).
  const bottomInset = Math.max(useSafeAreaInsets().bottom, 10);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {!isConnected && <OfflineBanner />}
      <Tabs
        screenOptions={{
          headerTitleAlign: 'left',
          headerShadowVisible: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.outlineVariant,
            elevation: 0,
            shadowOpacity: 0,
            height: 60 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 15,
            fontWeight: '700',
            letterSpacing: 0.3,
          },
          headerStyle: {
            backgroundColor: theme.colors.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: {
            fontWeight: '800',
            fontSize: 26,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Fridge',
            headerTitle: 'My Fridge',
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons name={focused ? "fridge" : "fridge-outline"} size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="cook"
          options={{
            title: 'Cook',
            headerTitle: 'Cook',
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons name={focused ? "pot-steam" : "pot-steam-outline"} size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="cookbook"
          options={{
            title: 'Cookbook',
            headerTitle: 'Cookbook',
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons name={focused ? "book-open-variant" : "book-open-outline"} size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerTitle: 'Settings',
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons name={focused ? "cog" : "cog-outline"} size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen name="history" options={{ href: null, headerTitle: 'History' }} />
        <Tabs.Screen name="profile" options={{ href: null, headerTitle: 'Taste Profile' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  offlineText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
