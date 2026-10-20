import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, TextInput, Button, Chip, ProgressBar, Divider, useTheme } from 'react-native-paper';
import { useProfileStore } from '../../src/stores/profileStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function ProfileBar({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.barRow}>
      <Text variant="bodyMedium" style={[styles.barLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.barContainer}>
        <ProgressBar progress={value / 10} color={color} style={styles.bar} />
      </View>
      <Text variant="bodySmall" style={[styles.barValue, { color: theme.colors.onSurfaceVariant }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, isLoading, loadProfile, updateProfile, recalculateFromHistory } = useProfileStore();
  const [newRestriction, setNewRestriction] = useState('');
  const [newAllergy, setNewAllergy] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const addRestriction = () => {
    if (!newRestriction.trim() || !profile) return;
    if (profile.dietary_restrictions.includes(newRestriction.trim())) { setNewRestriction(''); return; }
    const updated = [...profile.dietary_restrictions, newRestriction.trim()];
    updateProfile({ dietary_restrictions: updated });
    setNewRestriction('');
  };

  const removeRestriction = (r: string) => {
    if (!profile) return;
    updateProfile({ dietary_restrictions: profile.dietary_restrictions.filter(x => x !== r) });
  };

  const addAllergy = () => {
    if (!newAllergy.trim() || !profile) return;
    if (profile.allergies.includes(newAllergy.trim())) { setNewAllergy(''); return; }
    const updated = [...profile.allergies, newAllergy.trim()];
    updateProfile({ allergies: updated });
    setNewAllergy('');
  };

  const removeAllergy = (a: string) => {
    if (!profile) return;
    updateProfile({ allergies: profile.allergies.filter(x => x !== a) });
  };

  if (!profile) return null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      {/* Stats */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Overview</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={[styles.statValue, { color: theme.colors.primary }]}>{profile.total_meals_cooked}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Meals Cooked</Text>
            </View>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={[styles.statValue, { color: theme.colors.primary }]}>{Object.keys(profile.cuisine_preferences).length}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Cuisines Tried</Text>
            </View>
            <View style={styles.statItem}>
              <Text variant="headlineMedium" style={[styles.statValue, { color: theme.colors.primary }]}>{Object.keys(profile.protein_preferences).length}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Proteins Tried</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Taste Preferences */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Taste Preferences</Text>
          <ProfileBar label="Spice Tolerance" value={profile.spice_tolerance} color="#E74C3C" />
          <ProfileBar label="Complexity" value={profile.complexity_preference} color="#3498DB" />
          {Object.entries(profile.flavor_profiles).map(([flavor, value]) => (
            <ProfileBar
              key={flavor}
              label={flavor.charAt(0).toUpperCase() + flavor.slice(1)}
              value={value}
              color={
                flavor === 'sweet' ? '#E91E63' :
                flavor === 'savory' ? '#795548' :
                flavor === 'umami' ? '#FF9800' :
                flavor === 'sour' ? '#FFC107' : '#607D8B'
              }
            />
          ))}
          <Button
            mode="outlined"
            onPress={recalculateFromHistory}
            style={{ marginTop: 12 }}
            icon="refresh"
          >
            Recalculate from History
          </Button>
        </Card.Content>
      </Card>

      {/* Top Proteins */}
      {Object.keys(profile.protein_preferences).length > 0 && (
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Protein Preferences</Text>
            {Object.entries(profile.protein_preferences)
              .sort(([, a], [, b]) => b - a)
              .map(([protein, score]) => (
                <ProfileBar
                  key={protein}
                  label={protein.charAt(0).toUpperCase() + protein.slice(1)}
                  value={score}
                  color="#E74C3C"
                />
              ))}
          </Card.Content>
        </Card>
      )}

      {/* Dietary Restrictions */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Dietary Restrictions</Text>
          <View style={styles.chipRow}>
            {profile.dietary_restrictions.map(r => (
              <Chip key={r} onClose={() => removeRestriction(r)} style={{ backgroundColor: theme.colors.primaryContainer }}>{r}</Chip>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              label="Add restriction"
              value={newRestriction}
              onChangeText={setNewRestriction}
              mode="outlined"
              dense
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button mode="contained" onPress={addRestriction} compact>Add</Button>
          </View>
        </Card.Content>
      </Card>

      {/* Allergies */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Allergies</Text>
          <View style={styles.chipRow}>
            {profile.allergies.map(a => (
              <Chip key={a} onClose={() => removeAllergy(a)} style={{ backgroundColor: theme.colors.errorContainer }}>{a}</Chip>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              label="Add allergy"
              value={newAllergy}
              onChangeText={setNewAllergy}
              mode="outlined"
              dense
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button mode="contained" onPress={addAllergy} compact>Add</Button>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 40 },
  card: { marginBottom: 12, borderRadius: 16, elevation: 1 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { width: 100 },
  barContainer: { flex: 1, marginHorizontal: 8 },
  bar: { height: 8, borderRadius: 4 },
  barValue: { width: 30, textAlign: 'right' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center' },
});
