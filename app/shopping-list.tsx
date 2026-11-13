import { useCallback, useMemo, useRef, useState } from 'react';
import { View, SectionList, StyleSheet, Share, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, IconButton, Button, TextInput, Snackbar, useTheme } from 'react-native-paper';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useShoppingStore, ShoppingItem } from '../src/stores/shoppingStore';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { formatAmount, parseTyped } from '../src/utils/units';
import { CategoryIcon, EmptyState, PressableScale } from '../src/components/ui';

const SOURCE_LABELS: Record<string, string> = {
  ai_recipe: 'For a recipe',
  low_stock: 'Ran out',
  monthly: 'Monthly plan',
};

export default function ShoppingListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { items, loadItems, addItem, togglePurchased, deleteItem, clearPurchased } = useShoppingStore();
  const { currency } = useSettingsStore();

  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snack, setSnackState] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const snackKey = useRef(0);
  const setSnack = (next: { message: string; onUndo?: () => void } | null) => {
    if (next) snackKey.current += 1;
    setSnackState(next);
  };

  useFocusEffect(useCallback(() => {
    loadItems();
    useInventoryStore.getState().loadItems();
  }, []));

  const toBuy = useMemo(() => items.filter(i => !i.is_purchased), [items]);
  const bought = useMemo(() => items.filter(i => i.is_purchased), [items]);
  const estimated = toBuy.reduce((sum, i) => sum + (i.estimated_price || 0) * (i.quantity || 0), 0);

  const sections = [
    ...(toBuy.length > 0 ? [{ title: `To buy · ${toBuy.length}`, key: 'buy', data: toBuy }] : []),
    ...(bought.length > 0 ? [{ title: `In the fridge · ${bought.length}`, key: 'bought', data: bought }] : []),
  ];

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addItem({
      name,
      quantity: parseTyped(newQuantity) || 1,
      unit: 'pcs',
      category: 'Other',
      estimated_price: 0,
      source: 'manual',
      recipe_id: null,
    });
    setNewName('');
    setNewQuantity('');
  };

  // Ticking an item off adds it to the fridge as its own item.
  const handleBought = async (item: ShoppingItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const inventory = useInventoryStore.getState();
      const before = inventory.items.map(i => ({ ...i }));
      await togglePurchased(item.id);
      await inventory.addBulkItems([{
        name: item.name,
        quantity: item.quantity > 0 ? item.quantity : 1,
        unit: item.unit,
        category: item.category || 'Other',
        price_per_unit: item.estimated_price || 0,
        total_price: (item.estimated_price || 0) * (item.quantity || 0),
        expiry_date: null,
        notes: 'Added from shopping list',
      }]);
      setSnack({
        message: `${item.name} added to your fridge`,
        onUndo: async () => {
          const store = useInventoryStore.getState();
          const beforeIds = new Set(before.map(i => i.id));
          const created = store.items.filter(i => !beforeIds.has(i.id)).map(i => i.id);
          if (created.length > 0) await store.deleteItems(created);
          await togglePurchased(item.id);
        },
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update the item');
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = async () => {
    if (toBuy.length === 0) return;
    const lines = toBuy.map(i => `☐ ${i.name} — ${formatAmount(i.quantity, i.unit)}`);
    const message = `Shopping list (${toBuy.length} items)\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('Could not share', 'Sharing is not available on this device.');
    }
  };

  const renderItem = ({ item }: { item: ShoppingItem }) => {
    const done = !!item.is_purchased;
    return (
      <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, done && { opacity: 0.55 }]}>
        {/* Bought items are already in the fridge; un-ticking is only offered through Undo,
            so the same purchase can't be added to the fridge twice. */}
        <PressableScale
          onPress={() => { if (!done) handleBought(item); }}
          disabled={done || busyId !== null}
          scaleTo={0.85}
          style={[styles.check, done && { opacity: 1 }]}
          accessibilityLabel={done ? `${item.name}, bought` : `Mark ${item.name} as bought`}
        >
          <MaterialCommunityIcons
            name={done ? 'check-circle' : 'checkbox-blank-circle-outline'}
            size={28}
            color={done ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
        </PressableScale>
        <CategoryIcon category={item.category || 'Other'} size={36} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            variant="titleSmall"
            numberOfLines={2}
            style={{ color: theme.colors.onSurface, fontWeight: '700', textDecorationLine: done ? 'line-through' : 'none' }}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
            {formatAmount(item.quantity, item.unit)}
            {item.estimated_price > 0 ? ` · ~${currency}${(item.estimated_price * item.quantity).toFixed(2)}` : ''}
            {SOURCE_LABELS[item.source] ? ` · ${SOURCE_LABELS[item.source]}` : ''}
          </Text>
        </View>
        <IconButton
          icon="close"
          size={18}
          onPress={() => deleteItem(item.id)}
          iconColor={theme.colors.onSurfaceVariant}
          accessibilityLabel={`Remove ${item.name}`}
        />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Shopping List',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
          headerRight: () => (
            <IconButton
              icon="share-variant-outline"
              onPress={handleShare}
              disabled={toBuy.length === 0}
              iconColor={theme.colors.onSurface}
              accessibilityLabel="Share list"
            />
          ),
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'web' ? 0 : 80}
      >
        {/* Quick add */}
        <View style={[styles.addBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <TextInput
            placeholder="Add an item…"
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            mode="flat"
            dense
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            style={[styles.addInput, { backgroundColor: 'transparent' }]}
          />
          <TextInput
            placeholder="Qty"
            value={newQuantity}
            onChangeText={v => setNewQuantity(v.replace(/[^\d.,]/g, ''))}
            onSubmitEditing={handleAdd}
            keyboardType="decimal-pad"
            mode="flat"
            dense
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            style={[styles.qtyInput, { backgroundColor: 'transparent' }]}
          />
          <IconButton
            icon="plus"
            mode="contained"
            containerColor={theme.colors.primary}
            iconColor={theme.colors.onPrimary}
            size={20}
            disabled={!newName.trim()}
            onPress={handleAdd}
            accessibilityLabel="Add to list"
          />
        </View>

        {toBuy.length > 0 ? (
          <View style={styles.summary}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Tick items off as you shop — they go straight into your fridge.
            </Text>
            {estimated > 0 ? (
              <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: '700', marginTop: 4 }}>
                Estimated total: {currency}{estimated.toFixed(2)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>{section.title.toUpperCase()}</Text>
              {section.key === 'bought' ? (
                <Button compact mode="text" onPress={clearPurchased}>Clear</Button>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="cart-outline"
              title="Nothing to buy"
              subtitle="Add items above, or let the AI plan a month of groceries around what you cook."
              actionLabel="Plan monthly shop"
              onAction={() => router.push('/monthly-shopping')}
            />
          }
        />

        <Snackbar
          key={snackKey.current}
          visible={!!snack}
          onDismiss={() => setSnack(null)}
          duration={4000}
          action={snack?.onUndo ? { label: 'Undo', onPress: () => snack.onUndo?.() } : undefined}
        >
          {snack?.message || ''}
        </Snackbar>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBar: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, paddingLeft: 4 },
  addInput: { flex: 1, fontSize: 15 },
  qtyInput: { width: 64, fontSize: 15 },
  summary: { paddingHorizontal: 20, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6, minHeight: 32 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, marginBottom: 8, paddingVertical: 6 },
  check: { paddingHorizontal: 10, paddingVertical: 6 },
});
