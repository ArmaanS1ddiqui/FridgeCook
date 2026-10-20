import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Card, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNetwork } from '../../src/hooks/useNetwork';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isConnected } = useNetwork();

  const menuItems = [
    {
      title: 'App Settings',
      description: 'API keys, AI model, theme, currency',
      icon: 'cog-outline' as const,
      onPress: () => router.push('/app-settings'),
      color: theme.colors.primary,
    },
    {
      title: 'Taste Profile',
      description: 'Your preferences, dietary restrictions, allergies',
      icon: 'account-outline' as const,
      onPress: () => router.push('/taste-profile'),
      color: theme.colors.secondary,
    },
    {
      title: 'Cooking History',
      description: 'Past dishes, ratings, and costs',
      icon: 'history' as const,
      onPress: () => router.push('/cooking-history'),
      color: theme.colors.tertiary,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {menuItems.map((item, index) => (
        <Card
          key={index}
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          onPress={item.onPress}
        >
          <Card.Content style={styles.cardContent}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + '18' }]}>
              <MaterialCommunityIcons name={item.icon} size={26} color={item.color} />
            </View>
            <View style={styles.cardText}>
              <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                {item.title}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.description}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          </Card.Content>
        </Card>
      ))}

      {/* Status */}
      <View style={styles.statusSection}>
        <View style={styles.statusRow}>
          <MaterialCommunityIcons
            name={isConnected ? 'wifi' : 'wifi-off'}
            size={18}
            color={isConnected ? theme.colors.primary : theme.colors.error}
          />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
            {isConnected ? 'Connected' : 'No internet connection'}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.outlineVariant, marginTop: 12, textAlign: 'center' }}>
          FridgeCook v1.0.1 — All data stored locally
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 12, borderRadius: 16 },
  cardContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardText: { flex: 1 },
  cardTitle: { fontWeight: '700', marginBottom: 2 },
  statusSection: { marginTop: 24, alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
});
