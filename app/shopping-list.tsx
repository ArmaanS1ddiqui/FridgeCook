import { useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { Text, Card, IconButton, FAB, Button, Chip, TextInput, useTheme } from 'react-native-paper';
import { useShoppingStore, ShoppingItem } from '../src/stores/shoppingStore';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { useSettingsStore } from '../src/stores/settingsStore';

export default function ShoppingListScreen() {
  const theme = useTheme();
  const { items, loadItems, addItem, togglePurchased, deleteItem, clearPurchased } = useShoppingStore();
  const { addItem: addToInventory } = useInventoryStore();
  const { currency } = useSettingsStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newUnit, setNewUnit] = useState('pcs');

  useEffect(() => {
    loadItems();
  }, []);

  const unpurchased = items.filter(i => !i.is_purchased);
  const purchased = items.filter(i => i.is_purchased);
  const totalEstimated = unpurchased.reduce((sum, i) => sum + i.estimated_price * i.quantity, 0);

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    await addItem({
      name: newName.trim(),
      quantity: parseFloat(newQuantity) || 1,
      unit: newUnit,
      category: 'Other',
      estimated_price: 0,
      source: 'manual',
      recipe_id: null,
    });
    setNewName('');
    setNewQuantity('1');
    setShowAdd(false);
  };

  const handlePurchaseAndAdd = async (item: ShoppingItem) => {
    await togglePurchased(item.id);
    // Also add to fridge inventory
    await addToInventory({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      price_per_unit: item.estimated_price,
      total_price: item.estimated_price * item.quantity,
      expiry_date: null,
      notes: 'Added from shopping list',
    });
  };

  const renderItem = ({ item }: { item: ShoppingItem }) => (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }, item.is_purchased ? styles.purchasedCard : undefined]}>
      <Card.Content style={styles.itemContent}>
        <IconButton
          icon={item.is_purchased ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
          iconColor={item.is_purchased ? theme.colors.primary : theme.colors.onSurfaceVariant}
          onPress={() => item.is_purchased ? togglePurchased(item.id) : handlePurchaseAndAdd(item)}
          size={22}
        />
        <View style={{ flex: 1 }}>
          <Text
            variant="bodyMedium"
            style={[
              styles.itemName,
              { color: theme.colors.onSurface },
              item.is_purchased ? { textDecorationLine: 'line-through', color: theme.colors.onSurfaceVariant } : undefined,
            ]}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.quantity} {item.unit}
            {item.source === 'ai_recipe' && ' • From recipe'}
            {item.source === 'low_stock' && ' • Low stock'}
          </Text>
        </View>
        <IconButton
          icon="delete-outline"
          size={18}
          onPress={() => deleteItem(item.id)}
          iconColor={theme.colors.onSurfaceVariant}
        />
      </Card.Content>
    </Card>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Shopping List',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: theme.colors.onPrimary,
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Summary */}
        <View style={[styles.summary, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}>
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
            {unpurchased.length} items to buy
          </Text>
          {totalEstimated > 0 && (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Estimated: {currency}{totalEstimated.toFixed(2)}
            </Text>
          )}
        </View>

        {showAdd && (
          <Card style={[styles.addCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <TextInput
                label="Item name"
                value={newName}
                onChangeText={setNewName}
                mode="outlined"
                dense
                style={{ marginBottom: 8 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  label="Qty"
                  value={newQuantity}
                  onChangeText={setNewQuantity}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  style={{ flex: 1 }}
                />
                <TextInput
                  label="Unit"
                  value={newUnit}
                  onChangeText={setNewUnit}
                  mode="outlined"
                  dense
                  style={{ flex: 1 }}
                />
                <Button mode="contained" onPress={handleAddItem} compact>Add</Button>
              </View>
            </Card.Content>
          </Card>
        )}

        <FlatList
          data={[...unpurchased, ...purchased]}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="cart-outline" size={80} color={theme.colors.outlineVariant} />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>Shopping list is empty</Text>
            </View>
          }
        />

        {purchased.length > 0 && (
          <Button mode="text" onPress={clearPurchased} style={styles.clearButton} textColor={theme.colors.onSurfaceVariant}>
            Clear purchased items
          </Button>
        )}

        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowAdd(!showAdd)}
          color={theme.colors.onPrimary}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  addCard: { margin: 12, borderRadius: 16, elevation: 1 },
  list: { padding: 12, paddingBottom: 80 },
  card: { marginBottom: 6, borderRadius: 16, elevation: 1 },
  purchasedCard: { opacity: 0.6 },
  itemContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  itemName: { fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  clearButton: { alignSelf: 'center', marginBottom: 20 },
  fab: { position: 'absolute', bottom: 16, right: 16 },
});
