import { Tabs } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetwork } from '../../src/hooks/useNetwork';
import { View, Text, StyleSheet } from 'react-native';

function OfflineBanner() {
  const theme = useTheme();
  return (
    <View style={[styles.offlineBanner, { backgroundColor: theme.colors.error }]}>
      <MaterialCommunityIcons name="wifi-off" size={14} color="#FFF" />
      <Text style={styles.offlineText}>No Internet</Text>
    </View>
  );
}

export default function TabLayout() {
  const theme = useTheme();
  const { isConnected } = useNetwork();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {!isConnected && <OfflineBanner />}
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: 84,
            paddingBottom: 26,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 0.3,
          },
          headerStyle: {
            backgroundColor: theme.colors.surface,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 22,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Fridge',
            headerTitle: 'My Fridge',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="fridge-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="cook"
          options={{
            title: 'Cook',
            headerTitle: 'Cook',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="pot-steam-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="cookbook"
          options={{
            title: 'Cookbook',
            headerTitle: 'Cookbook',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="book-open-outline" size={size} color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerTitle: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="cog-outline" size={size} color={color as string} />
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
