import { useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Card, Text, Chip, useTheme } from 'react-native-paper';
import { useCookingStore, CookingHistoryItem } from '../../src/stores/cookingStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSettingsStore } from '../../src/stores/settingsStore';

function StarRating({ rating, label }: { rating: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.ratingRow}>
      <Text variant="bodySmall" style={[styles.ratingLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map(i => (
          <MaterialCommunityIcons
            key={i}
            name={i <= rating ? 'star' : i - 0.5 <= rating ? 'star-half-full' : 'star-outline'}
            size={14}
            color="#FFB300"
          />
        ))}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const theme = useTheme();
  const { history, isLoading, loadHistory } = useCookingStore();
  const { currency } = useSettingsStore();

  useEffect(() => {
    loadHistory();
  }, []);

  const renderItem = ({ item }: { item: CookingHistoryItem }) => {
    const cookTypeLabel = {
      manual: 'Manual',
      ai_inventory: 'AI Cook',
      ai_extras: 'AI + Extras',
    }[item.cook_type];

    const cookTypeColor = {
      manual: theme.colors.primary,
      ai_inventory: theme.colors.secondary,
      ai_extras: theme.colors.tertiary,
    }[item.cook_type];

    return (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={[styles.dishName, { color: theme.colors.onSurface }]}>{item.dish_name}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {format(new Date(item.cook_date), 'MMM d, yyyy • h:mm a')}
              </Text>
            </View>
            <Chip compact textStyle={{ fontSize: 11 }} style={{ backgroundColor: cookTypeColor + '20' }}>
              {cookTypeLabel}
            </Chip>
          </View>

          <View style={styles.ratingsContainer}>
            <StarRating rating={item.rating_taste} label="Taste" />
            <StarRating rating={item.rating_effort} label="Effort" />
            <StarRating rating={item.rating_would_make_again} label="Again?" />
            <StarRating rating={item.rating_spice_level} label="Spice" />
          </View>

          <View style={[styles.costRow, { borderTopColor: theme.colors.outlineVariant }]}>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.primary }}>
              Cost: {currency}{item.total_cost.toFixed(2)}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.servings} serving{item.servings > 1 ? 's' : ''} • {currency}{(item.total_cost / (item.servings || 1)).toFixed(2)}/serving
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="history" size={80} color={theme.colors.outlineVariant} />
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>No cooking history yet</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.outlineVariant, marginTop: 4 }}>
              Start cooking to build your history!
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, paddingBottom: 40 },
  card: { marginBottom: 12, borderRadius: 16, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  dishName: { fontWeight: '700' },
  ratingsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  ratingRow: { alignItems: 'center' },
  ratingLabel: { marginBottom: 2, fontSize: 11 },
  stars: { flexDirection: 'row' },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
});
