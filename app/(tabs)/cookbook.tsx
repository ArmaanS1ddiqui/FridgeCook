import { useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { Card, Text, IconButton, Chip, FAB, useTheme } from 'react-native-paper';
import { useRecipeStore, SavedRecipe } from '../../src/stores/recipeStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function CookbookScreen() {
  const theme = useTheme();
  const { recipes, isLoading, loadRecipes, toggleFavorite, deleteRecipe } = useRecipeStore();
  const router = useRouter();

  useEffect(() => {
    loadRecipes();
  }, []);

  const renderItem = ({ item }: { item: SavedRecipe }) => {
    let ingredients: any[] = [];
    try { ingredients = JSON.parse(item.ingredients); } catch {}

    return (
      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push(`/recipe-detail?id=${item.id}`)}
        onLongPress={() => {
          Alert.alert('Delete Recipe', `Delete "${item.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteRecipe(item.id) },
          ]);
        }}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={[styles.recipeName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              {item.cuisine && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>{item.cuisine}</Text>
              )}
            </View>
            <IconButton
              icon={item.is_favorite ? 'heart' : 'heart-outline'}
              iconColor={item.is_favorite ? theme.colors.error : theme.colors.onSurfaceVariant}
              size={20}
              onPress={() => toggleFavorite(item.id)}
            />
          </View>
          <View style={styles.metaRow}>
            <Chip compact icon="clock-outline" textStyle={styles.metaText}>
              {item.prep_time_minutes + item.cook_time_minutes} min
            </Chip>
            <Chip compact icon="silverware-fork-knife" textStyle={styles.metaText}>
              {item.servings} servings
            </Chip>
            <Chip compact icon="signal" textStyle={styles.metaText}>
              Lvl {item.difficulty}/10
            </Chip>
            <Chip compact icon="food-variant" textStyle={styles.metaText}>
              {ingredients.length} items
            </Chip>
          </View>
          {item.description && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={recipes}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="book-open-variant" size={80} color={theme.colors.outlineVariant} />
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>No saved recipes</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.outlineVariant, marginTop: 4 }}>
              AI-generated recipes you save will appear here
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
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  recipeName: { fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  metaText: { fontSize: 11 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
});
