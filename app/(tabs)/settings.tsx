import { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNetwork } from '../../src/hooks/useNetwork';
import { exportBackup, importBackup } from '../../src/services/backupService';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [isBackingUp, setIsBackingUp] = useState(false);

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
    {
      title: 'Export Backup',
      description: 'Save all your data as a file',
      icon: 'download-outline' as const,
      onPress: async () => {
        setIsBackingUp(true);
        await exportBackup();
        setIsBackingUp(false);
      },
      color: theme.colors.primary,
    },
    {
      title: 'Import Backup',
      description: 'Restore data from a backup file',
      icon: 'upload-outline' as const,
      onPress: () => {
        Alert.alert(
          'Import Backup',
          'This will replace ALL your current data. Are you sure?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              style: 'destructive',
              onPress: async () => {
                setIsBackingUp(true);
                const success = await importBackup();
                setIsBackingUp(false);
                if (success) {
                  Alert.alert('Success', 'Backup restored! Restart the app to see changes.');
                }
              },
            },
          ]
        );
      },
      color: theme.colors.error,
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
          FridgeCook v1.2.0 — All data stored locally
        </Text>
      </View>

      {isBackingUp && (
        <View style={{ alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            Processing backup...
          </Text>
        </View>
      )}
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
