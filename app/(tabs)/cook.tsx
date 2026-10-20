import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function CookScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text variant="titleLarge" style={[styles.heading, { color: theme.colors.onSurface }]}>What would you like to do?</Text>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => router.push('/manual-cook')}>
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="pot-steam" size={36} color={theme.colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Manual Cook</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              Select ingredients from your fridge, cook a dish, and rate it
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => router.push('/ai-cook?mode=inventory')}>
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.secondaryContainer }]}>
            <MaterialCommunityIcons name="robot-outline" size={36} color={theme.colors.secondary} />
          </View>
          <View style={styles.cardText}>
            <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>AI Cook - Inventory Only</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              Get recipe suggestions using only what's in your fridge
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => router.push('/ai-cook?mode=extras')}>
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <MaterialCommunityIcons name="cart-plus" size={36} color={theme.colors.tertiary} />
          </View>
          <View style={styles.cardText}>
            <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>AI Cook + Extras</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              Recipes that may need a few extra ingredients you can buy
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => router.push('/shopping-list')}>
        <Card.Content style={styles.cardContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.inversePrimary }]}>
            <MaterialCommunityIcons name="cart-outline" size={36} color={theme.colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Shopping List</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              View and manage your shopping list
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  heading: {
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 16,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
});
