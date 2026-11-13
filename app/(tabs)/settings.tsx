import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Card, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import {
  autoBackupSupported, AutoBackupStatus, disableAutoBackup, getAutoBackupStatus, runAutoBackup, setUpBackupFolder,
} from '../../src/services/autoBackup';
import { reloadAllStores } from '../../src/services/reloadStores';
import { Pressable } from 'react-native';
import { useNetwork } from '../../src/hooks/useNetwork';
import { exportBackup, importBackup } from '../../src/services/backupService';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [autoBackup, setAutoBackup] = useState<AutoBackupStatus | null>(null);

  const refreshAutoBackup = useCallback(() => {
    if (autoBackupSupported) getAutoBackupStatus().then(setAutoBackup).catch(() => {});
  }, []);
  useFocusEffect(refreshAutoBackup);

  const chooseBackupFolder = async () => {
    setIsBackingUp(true);
    try {
      await setUpBackupFolder(reloadAllStores);
    } finally {
      setIsBackingUp(false);
      refreshAutoBackup();
    }
  };

  const backupFolderProblem = autoBackupSupported && !!autoBackup && (!autoBackup.enabled || autoBackup.folderMissing);

  const handleAutoBackupPress = () => {
    if (!autoBackup?.enabled || autoBackup.folderMissing) {
      Alert.alert(
        autoBackup?.folderMissing ? 'FridgeCook folder not found' : 'Automatic backup',
        'FridgeCook keeps its backups in a "FridgeCook" folder on your phone, which survives reinstalling the app. Android asks you to approve a location once: tap "Use this folder" on Documents and the app creates or finds the folder itself. If a backup is already there, you can restore it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: chooseBackupFolder },
        ],
      );
      return;
    }
    Alert.alert(
      'Automatic backup',
      `Saving to: ${autoBackup.folder}${autoBackup.error ? `\n\n${autoBackup.error}` : ''}`,
      [
        { text: 'Turn off', style: 'destructive', onPress: async () => { await disableAutoBackup(); refreshAutoBackup(); } },
        { text: 'Change folder', onPress: chooseBackupFolder },
        {
          text: 'Back up now',
          onPress: async () => {
            setIsBackingUp(true);
            try {
              const result = await runAutoBackup({ force: true });
              if (result === 'failed') Alert.alert('Backup failed', (await getAutoBackupStatus()).error || 'Could not write the backup file.');
            } finally {
              setIsBackingUp(false);
              refreshAutoBackup();
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const autoBackupDescription = !autoBackup?.enabled
    ? 'Off — keep a backup in a FridgeCook folder on your phone'
    : autoBackup.folderMissing
      ? 'FridgeCook folder not found — tap to reconnect'
    : autoBackup.error
      ? autoBackup.error
      : autoBackup.lastBackup
        ? `On · ${autoBackup.folder} · saved ${formatDistanceToNow(new Date(autoBackup.lastBackup), { addSuffix: true })}`
        : `On · ${autoBackup.folder}`;

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
    ...(autoBackupSupported ? [{
      title: 'Automatic Backup',
      description: autoBackupDescription,
      icon: 'cloud-sync-outline' as const,
      onPress: handleAutoBackupPress,
      color: autoBackup?.error || autoBackup?.folderMissing ? theme.colors.error : theme.colors.primary,
    }] : []),
    {
      title: 'Export Backup',
      description: 'Save all your data as a file',
      icon: 'download-outline' as const,
      onPress: async () => {
        setIsBackingUp(true);
        try { await exportBackup(); } finally { setIsBackingUp(false); }
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
                try {
                  const success = await importBackup();
                  if (success) {
                    await reloadAllStores();
                    Alert.alert('Backup restored', 'Your data and preferences are back.');
                  }
                } finally {
                  setIsBackingUp(false);
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
          mode="contained"
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
        {/* Only shown when something is wrong: no backup folder connected, or it has gone missing. */}
        {backupFolderProblem ? (
          <Pressable onPress={handleAutoBackupPress} style={[styles.statusRow, { marginTop: 10 }]} accessibilityRole="button">
            <MaterialCommunityIcons name="folder-alert-outline" size={18} color={theme.colors.error} />
            <Text variant="bodyMedium" style={{ color: theme.colors.error, marginLeft: 8 }}>
              FridgeCook folder not found · Tap to set up
            </Text>
          </Pressable>
        ) : null}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}>
          FridgeCook v1.9.0 — All data stored locally
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
  card: { marginBottom: 10, borderRadius: 20 },
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
