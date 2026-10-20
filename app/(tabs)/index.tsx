import { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import {
  FAB, Searchbar, Card, Text, Chip, IconButton, Portal, Modal,
  Button, TextInput, SegmentedButtons, Menu, Divider, Badge, useTheme,
} from 'react-native-paper';
import { useInventoryStore, InventoryItem } from '../../src/stores/inventoryStore';
import { CATEGORIES, UNITS, CATEGORY_COLORS, CATEGORY_ICONS } from '../../src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '../../src/stores/settingsStore';

export default function FridgeScreen() {
  const theme = useTheme();
  const { currency } = useSettingsStore();
  const { items, isLoading, totalValue, loadItems, addItem, deleteItem, updateItem } = useInventoryStore();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMergeMode, setShowMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [showMergeNameModal, setShowMergeNameModal] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const router = useRouter();

  // Add form state
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newCategory, setNewCategory] = useState('Other');
  const [newPrice, setNewPrice] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Check for expiring items (within 3 days)
  const expiringItems = items.filter(item => {
    if (!item.expiry_date) return false;
    const expiry = new Date(item.expiry_date);
    const now = new Date();
    const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 3 && diffDays >= 0;
  });

  const expiredItems = items.filter(item => {
    if (!item.expiry_date) return false;
    return new Date(item.expiry_date) < new Date();
  });

  const resetForm = () => {
    setNewName('');
    setNewQuantity('');
    setNewUnit('pcs');
    setNewCategory('Other');
    setNewPrice('');
    setNewExpiry('');
    setNewNotes('');
    setEditingItem(null);
  };

  const handleSaveItem = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Please enter an item name');
      return;
    }
    if (!newQuantity || parseFloat(newQuantity) <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }

    if (editingItem) {
      await updateItem(editingItem.id, {
        name: newName.trim(),
        quantity: parseFloat(newQuantity),
        unit: newUnit,
        category: newCategory,
        price_per_unit: parseFloat(newPrice) || 0,
        expiry_date: newExpiry || null,
        notes: newNotes || null,
      });
    } else {
      await addItem({
        name: newName.trim(),
        quantity: parseFloat(newQuantity),
        unit: newUnit,
        category: newCategory,
        price_per_unit: parseFloat(newPrice) || 0,
        total_price: (parseFloat(newPrice) || 0) * parseFloat(newQuantity),
        expiry_date: newExpiry || null,
        notes: newNotes || null,
      });
    }

    resetForm();
    setShowAddModal(false);
  };

  const handleStartEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setNewName(item.name);
    setNewQuantity(item.quantity.toString());
    setNewUnit(item.unit);
    setNewCategory(item.category);
    setNewPrice(item.price_per_unit.toString());
    setNewExpiry(item.expiry_date || '');
    setNewNotes(item.notes || '');
    setShowAddModal(true);
  };

  const handleMergeToggle = (id: string) => {
    setSelectedForMerge(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleMerge = () => {
    if (selectedForMerge.length < 2) {
      Alert.alert('Select Items', 'Please select at least 2 items to merge');
      return;
    }
    setShowMergeNameModal(true);
  };

  const confirmMerge = async () => {
    if (!mergeName.trim()) {
      Alert.alert('Error', 'Please select or enter a name');
      return;
    }
    const { mergeItems } = useInventoryStore.getState();
    await mergeItems(selectedForMerge, mergeName.trim());
    setSelectedForMerge([]);
    setShowMergeMode(false);
    setShowMergeNameModal(false);
    setMergeName('');
  };

  const mergeableItems = items.filter(i => selectedForMerge.includes(i.id));

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const isSelected = selectedForMerge.includes(item.id);
    const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
    const isExpiring = item.expiry_date && !isExpired && (() => {
      const diffDays = (new Date(item.expiry_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    })();

    return (
      <Card
        style={[
          styles.itemCard,
          { backgroundColor: theme.colors.surface },
          isSelected && { backgroundColor: theme.colors.primaryContainer, borderWidth: 2, borderColor: theme.colors.primary },
          isExpired && { backgroundColor: theme.colors.errorContainer, borderWidth: 1, borderColor: theme.colors.error },
        ]}
        onPress={() => showMergeMode ? handleMergeToggle(item.id) : handleStartEdit(item)}
        onLongPress={() => {
          Alert.alert('Delete Item', `Delete "${item.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item.id) },
          ]);
        }}
      >
        <Card.Content style={styles.itemContent}>
          <View style={styles.itemLeft}>
            {showMergeMode && (
              <MaterialCommunityIcons
                name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                style={{ marginRight: 8 }}
              />
            )}
            <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLORS[item.category] || '#95A5A6' }]} />
            <View style={styles.itemInfo}>
              <Text variant="titleMedium" style={[styles.itemName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {item.unit === '%' ? `${item.quantity}%` : `${item.quantity} ${item.unit}`} • {item.category}
                {item.expiry_date && (
                  isExpired ? ' • EXPIRED' :
                  isExpiring ? ' • Expiring soon!' : ''
                )}
              </Text>
            </View>
          </View>
          <View style={styles.itemRight}>
            {item.total_price > 0 && (
              <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                {currency}{item.total_price.toFixed(2)}
              </Text>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Summary Bar */}
      <View style={[styles.summaryBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}>
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.primary }]}>{items.length}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Items</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.outline }]} />
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.primary }]}>{currency}{totalValue.toFixed(2)}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Total Value</Text>
        </View>
        {(expiringItems.length > 0 || expiredItems.length > 0) && (
          <>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.outline }]} />
            <View style={styles.summaryItem}>
              <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.error }]}>
                {expiringItems.length + expiredItems.length}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 2 }}>
                {expiredItems.length > 0 ? 'Expired' : 'Expiring'}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Search and Filter */}
      <Searchbar
        placeholder="Search items..."
        value={search}
        onChangeText={setSearch}
        style={[styles.searchbar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
        inputStyle={styles.searchInput}
      />

      {/* Category Filter Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...CATEGORIES]}
        keyExtractor={(item) => item || 'all'}
        style={styles.chipList}
        contentContainerStyle={styles.chipContainer}
        renderItem={({ item: cat }) => (
          <Chip
            selected={filterCategory === cat}
            onPress={() => setFilterCategory(cat)}
            style={[
              styles.chip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline },
              filterCategory === cat && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary },
            ]}
            textStyle={filterCategory === cat ? { color: theme.colors.primary } : undefined}
            compact
          >
            {cat || 'All'}
          </Chip>
        )}
      />

      {/* Merge Mode Bar */}
      {showMergeMode && (
        <View style={[styles.mergeBar, { backgroundColor: theme.colors.tertiaryContainer }]}>
          <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.tertiary }}>
            {selectedForMerge.length} selected
          </Text>
          <Button mode="contained" onPress={handleMerge} disabled={selectedForMerge.length < 2} compact>
            Merge
          </Button>
          <Button mode="outlined" onPress={() => { setShowMergeMode(false); setSelectedForMerge([]); }} compact>
            Cancel
          </Button>
        </View>
      )}

      {/* Item List */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadItems} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="fridge-outline" size={80} color={theme.colors.outlineVariant} />
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>Your fridge is empty</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.outlineVariant, marginTop: 4 }}>
              Tap + to add items or scan a receipt
            </Text>
          </View>
        }
      />

      {/* FAB Group */}
      <View style={styles.fabContainer}>
        <FAB
          icon="merge"
          size="small"
          style={[styles.fabSmall, { backgroundColor: theme.colors.tertiary }]}
          color={theme.colors.onTertiary}
          onPress={() => setShowMergeMode(!showMergeMode)}
        />
        <FAB
          icon="camera"
          size="small"
          style={[styles.fabSmall, { backgroundColor: theme.colors.secondary }]}
          color={theme.colors.onSecondary}
          onPress={() => router.push('/scan')}
        />
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => { resetForm(); setShowAddModal(true); }}
          color={theme.colors.onPrimary}
        />
      </View>

      {/* Add/Edit Item Modal */}
      <Portal>
        <Modal
          visible={showAddModal}
          onDismiss={() => { setShowAddModal(false); resetForm(); }}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="headlineSmall" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {editingItem ? 'Edit Item' : 'Add Item'}
          </Text>

          <TextInput
            label="Item Name"
            value={newName}
            onChangeText={setNewName}
            mode="outlined"
            style={styles.input}
          />

          <View style={styles.row}>
            <TextInput
              label="Quantity"
              value={newQuantity}
              onChangeText={setNewQuantity}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.input, { flex: 1, marginRight: 8 }]}
            />
            <Menu
              visible={showUnitMenu}
              onDismiss={() => setShowUnitMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setShowUnitMenu(true)} style={styles.unitButton}>
                  {newUnit}
                </Button>
              }
            >
              {UNITS.map(u => (
                <Menu.Item key={u} onPress={() => { setNewUnit(u); setShowUnitMenu(false); }} title={u} />
              ))}
            </Menu>
          </View>

          <Menu
            visible={showCategoryMenu}
            onDismiss={() => setShowCategoryMenu(false)}
            anchor={
              <Button mode="outlined" onPress={() => setShowCategoryMenu(true)} style={[styles.input, styles.categoryButton]}>
                Category: {newCategory}
              </Button>
            }
          >
            {CATEGORIES.map(c => (
              <Menu.Item key={c} onPress={() => { setNewCategory(c); setShowCategoryMenu(false); }} title={c} />
            ))}
          </Menu>

          <TextInput
            label={`Price per unit (${currency})`}
            value={newPrice}
            onChangeText={setNewPrice}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Expiry Date (YYYY-MM-DD)"
            value={newExpiry}
            onChangeText={setNewExpiry}
            mode="outlined"
            style={styles.input}
            placeholder="2024-12-31"
          />

          <TextInput
            label="Notes (optional)"
            value={newNotes}
            onChangeText={setNewNotes}
            mode="outlined"
            style={styles.input}
            multiline
          />

          <View style={styles.modalButtons}>
            <Button mode="outlined" onPress={() => { setShowAddModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button mode="contained" onPress={handleSaveItem}>
              {editingItem ? 'Update' : 'Add'}
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Merge Name Modal */}
      <Portal>
        <Modal
          visible={showMergeNameModal}
          onDismiss={() => setShowMergeNameModal(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="headlineSmall" style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Name Merged Item</Text>
          <Text variant="bodyMedium" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
            Merging {mergeableItems.length} items ({mergeableItems.map(i => `${i.name}`).join(' + ')})
          </Text>

          <Text variant="bodyMedium" style={{ marginBottom: 8, color: theme.colors.onSurface }}>Choose a name or type your own:</Text>
          {mergeableItems.map(item => (
            <Chip
              key={item.id}
              selected={mergeName === item.name}
              onPress={() => setMergeName(item.name)}
              style={[
                styles.mergeChip,
                mergeName === item.name && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary },
              ]}
            >
              {item.name}
            </Chip>
          ))}

          <TextInput
            label="Or type a custom name"
            value={mergeName}
            onChangeText={setMergeName}
            mode="outlined"
            style={styles.input}
          />

          <View style={styles.modalButtons}>
            <Button mode="outlined" onPress={() => setShowMergeNameModal(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmMerge}>Merge</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryBar: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  summaryItem: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  summaryValue: {
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 36,
  },
  searchbar: {
    margin: 12,
    elevation: 0,
    borderWidth: 1,
  },
  searchInput: {
    fontSize: 14,
  },
  chipList: {
    maxHeight: 44,
    paddingLeft: 12,
  },
  chipContainer: {
    gap: 6,
    paddingRight: 12,
  },
  chip: {
    borderWidth: 1,
  },
  mergeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  list: {
    padding: 12,
    paddingBottom: 100,
  },
  itemCard: {
    marginBottom: 8,
    borderRadius: 16,
    elevation: 1,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    alignItems: 'center',
    gap: 12,
  },
  fab: {
    borderRadius: 16,
  },
  fabSmall: {
    borderRadius: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  modal: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
    maxHeight: '85%',
  },
  modalTitle: {
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  unitButton: {
    marginTop: -4,
    minWidth: 70,
  },
  categoryButton: {
    justifyContent: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  mergeChip: {
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
});
