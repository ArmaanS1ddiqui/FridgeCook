import { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import {
  FAB, Searchbar, Card, Text, Chip, IconButton, Portal, Modal,
  Button, TextInput, Menu, useTheme, Snackbar,
} from 'react-native-paper';
import { useInventoryStore, InventoryItem } from '../../src/stores/inventoryStore';
import { CATEGORIES, CATEGORY_COLORS } from '../../src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSettingsStore } from '../../src/stores/settingsStore';

export default function FridgeScreen() {
  const theme = useTheme();
  const { currency } = useSettingsStore();
  const { items, isLoading, totalValue, loadItems, deleteItem, updateItem } = useInventoryStore();
  const [search, setSearch] = useState('');
  const [showMergeMode, setShowMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [showMergeNameModal, setShowMergeNameModal] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const router = useRouter();

  // Bulk select mode
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [showBulkCategoryMenu, setShowBulkCategoryMenu] = useState(false);

  const [snackMsg, setSnackMsg] = useState('');

  useFocusEffect(useCallback(() => {
    loadItems();
  }, []));

  const filteredItems = useMemo(() => items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  }), [items, search, filterCategory]);

  // Filtered value — changes based on active filter
  const filteredValue = useMemo(() => {
    if (!filterCategory) return totalValue;
    return filteredItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  }, [filteredItems, filterCategory, totalValue]);

  const filteredCount = filteredItems.length;

  // Expiry checks
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

  // Round to 2 decimal places safely
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const handleStartEdit = (item: InventoryItem) => {
    router.push(`/add-item?editId=${item.id}`);
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

  // Bulk select handlers
  const handleBulkToggle = (id: string) => {
    setBulkSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkCategoryAssign = async (category: string) => {
    for (const id of bulkSelected) {
      await updateItem(id, { category });
    }
    setSnackMsg(`${bulkSelected.length} items set to ${category}`);
    setBulkSelected([]);
    setBulkSelectMode(false);
    setShowBulkCategoryMenu(false);
  };

  const handleItemPress = (item: InventoryItem) => {
    if (bulkSelectMode) {
      handleBulkToggle(item.id);
    } else if (showMergeMode) {
      handleMergeToggle(item.id);
    } else {
      handleStartEdit(item);
    }
  };

  const handleItemLongPress = (item: InventoryItem) => {
    if (!bulkSelectMode && !showMergeMode) {
      setBulkSelectMode(true);
      setBulkSelected([item.id]);
    }
  };

  const mergeableItems = items.filter(i => selectedForMerge.includes(i.id));

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const isSelected = selectedForMerge.includes(item.id);
    const isBulkSelected = bulkSelected.includes(item.id);
    const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
    const isExpiring = item.expiry_date && !isExpired && (() => {
      const diffDays = (new Date(item.expiry_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    })();

    const showCheckbox = showMergeMode || bulkSelectMode;
    const checked = showMergeMode ? isSelected : isBulkSelected;

    return (
      <Card
        style={[
          styles.itemCard,
          { backgroundColor: theme.colors.surface },
          (isSelected || isBulkSelected) && { backgroundColor: theme.colors.primaryContainer, borderWidth: 2, borderColor: theme.colors.primary },
          isExpired && !isSelected && !isBulkSelected && { backgroundColor: theme.colors.errorContainer, borderWidth: 1, borderColor: theme.colors.error },
        ]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
      >
        <Card.Content style={styles.itemContent}>
          <View style={styles.itemLeft}>
            {showCheckbox && (
              <MaterialCommunityIcons
                name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
                style={{ marginRight: 8 }}
              />
            )}
            <View style={[styles.categoryDot, { backgroundColor: CATEGORY_COLORS[item.category] || '#95A5A6' }]} />
            <View style={styles.itemInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="titleMedium" numberOfLines={1} style={[styles.itemName, { color: theme.colors.onSurface, flex: 1 }]}>{item.name}</Text>
                {(isExpiring || isExpired) && (
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={18}
                    color={isExpired ? theme.colors.error : '#FF9800'}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {item.unit === '%' ? `${item.quantity}%` : `${item.quantity} ${item.unit}`} • {item.category}
                {item.price_per_unit > 0 && item.unit !== '%' && ` • ${currency}${round2(item.price_per_unit)}/${item.unit}`}
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
                {currency}{round2(item.total_price).toFixed(2)}
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
          <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.primary }]}>
            {filterCategory ? filteredCount : items.length}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {filterCategory ? filterCategory : 'Items'}
          </Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.outline }]} />
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.primary }]}>
            {currency}{filteredValue.toFixed(2)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {filterCategory ? `${filterCategory} Value` : 'Total Value'}
          </Text>
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

      {/* Search */}
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
        <View style={[styles.actionBar, { backgroundColor: theme.colors.tertiaryContainer }]}>
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

      {/* Bulk Select Bar */}
      {bulkSelectMode && (
        <View style={[styles.actionBar, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.secondary }}>
            {bulkSelected.length} selected
          </Text>
          <Menu
            visible={showBulkCategoryMenu}
            onDismiss={() => setShowBulkCategoryMenu(false)}
            anchor={
              <Button
                mode="contained"
                onPress={() => setShowBulkCategoryMenu(true)}
                disabled={bulkSelected.length === 0}
                compact
                buttonColor={theme.colors.secondary}
              >
                Set Category
              </Button>
            }
          >
            {CATEGORIES.map(c => (
              <Menu.Item key={c} onPress={() => handleBulkCategoryAssign(c)} title={c} />
            ))}
          </Menu>
          <Button
            mode="outlined"
            onPress={() => {
              if (bulkSelected.length === 0) return;
              Alert.alert(
                'Delete Items',
                `Delete ${bulkSelected.length} selected items?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      for (const id of bulkSelected) {
                        await deleteItem(id);
                      }
                      setBulkSelected([]);
                      setBulkSelectMode(false);
                      setSnackMsg(`${bulkSelected.length} items deleted`);
                    },
                  },
                ]
              );
            }}
            textColor={theme.colors.error}
            compact
          >
            Delete
          </Button>
          <Button mode="outlined" onPress={() => { setBulkSelectMode(false); setBulkSelected([]); }} compact>
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
        keyboardDismissMode="on-drag"
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
      {!bulkSelectMode && !showMergeMode && (
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
            onPress={() => router.push('/add-item')}
            color={theme.colors.onPrimary}
          />
        </View>
      )}

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

      {/* Snackbar */}
      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg('')}
        duration={2000}
        style={{ backgroundColor: theme.colors.inverseSurface }}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryBar: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  summaryItem: { alignItems: 'center', paddingHorizontal: 20 },
  summaryValue: { fontWeight: '700' },
  summaryDivider: { width: 1, height: 36 },
  searchbar: { margin: 12, elevation: 0, borderWidth: 1 },
  searchInput: { fontSize: 14 },
  chipList: { maxHeight: 44, paddingLeft: 12 },
  chipContainer: { gap: 6, paddingRight: 12 },
  chip: { borderWidth: 1 },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
  },
  list: { padding: 12, paddingBottom: 100 },
  itemCard: { marginBottom: 8, borderRadius: 16, elevation: 1 },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontWeight: '600' },
  itemRight: { alignItems: 'flex-end' },
  fabContainer: { position: 'absolute', bottom: 16, right: 16, alignItems: 'center', gap: 12 },
  fab: { borderRadius: 16 },
  fabSmall: { borderRadius: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  modal: { margin: 20, padding: 24, borderRadius: 16, maxHeight: '85%' },
  modalTitle: { fontWeight: '700', marginBottom: 16 },
  input: { marginBottom: 12 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  mergeChip: { marginBottom: 6, alignSelf: 'flex-start' },
});
