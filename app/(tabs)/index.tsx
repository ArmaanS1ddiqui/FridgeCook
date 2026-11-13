import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl, ScrollView } from 'react-native';
import {
  FAB, Searchbar, Text, IconButton, Portal, Modal, Button, TextInput, Menu, useTheme, Snackbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInventoryStore, InventoryItem } from '../../src/stores/inventoryStore';
import { useShoppingStore } from '../../src/stores/shoppingStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { CATEGORIES, CATEGORY_COLORS } from '../../src/constants/theme';
import { addDays, daysUntil, expiryStatus, formatDate, freezerDays, THAWED_DAYS } from '../../src/utils/expiry';
import { convertUnit, formatAmount, formatQty, stepFor } from '../../src/utils/units';
import { normalizeName } from '../../src/utils/matching';
import {
  ActionRow, BottomSheet, CategoryIcon, EmptyState, ExpiryPill, NumberField, PressableScale, useWarningColor,
} from '../../src/components/ui';

type SortMode = 'expiry' | 'name' | 'recent' | 'value';
const SORT_LABELS: Record<SortMode, string> = {
  expiry: 'Use first',
  name: 'Name A–Z',
  recent: 'Recently added',
  value: 'Highest value',
};

const USE_SOON = '__use_soon__';
const DUPLICATES = '__duplicates__';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function FridgeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { currency } = useSettingsStore();
  const {
    items, isLoading, totalValue, loadItems, deleteItems, setCategory, consumeItem, restoreItems, mergeItems, setFrozen,
  } = useInventoryStore();
  const addToShopping = useShoppingStore(s => s.addItem);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('expiry');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Multi-select (long-press)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selecting = selectedIds.length > 0;
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [mergeUnit, setMergeUnit] = useState('');
  const [mergeManual, setMergeManual] = useState<Record<string, number>>({});

  // Item sheet
  const [activeId, setActiveId] = useState<string | null>(null);
  const [useAmount, setUseAmount] = useState(0);
  const active = items.find(i => i.id === activeId) || null;

  const WARNING_COLOR = useWarningColor();
  const [snack, setSnackState] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  // Each message gets its own Snackbar instance (via key), so a new one always
  // appears with a fresh timer even if the previous one is still fading out.
  const snackKey = useRef(0);
  const setSnack = (next: { message: string; actionLabel?: string; onAction?: () => void } | null) => {
    if (next) snackKey.current += 1;
    setSnackState(next);
  };
  const [merging, setMerging] = useState(false);

  useFocusEffect(useCallback(() => {
    loadItems();
  }, []));

  const useSoonItems = useMemo(
    () => items.filter(i => { const s = expiryStatus(i.expiry_date); return s === 'soon' || s === 'expired'; }),
    [items],
  );
  const expiredCount = useMemo(() => items.filter(i => expiryStatus(i.expiry_date) === 'expired').length, [items]);
  const soonCount = useSoonItems.length - expiredCount;

  // Items that share a name with another item: highlighted so they can be merged by hand.
  const duplicateIds = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const item of items) {
      const key = normalizeName(item.name);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) || []), item.id]);
    }
    const ids = new Set<string>();
    for (const group of byName.values()) if (group.length > 1) group.forEach(id => ids.add(id));
    return ids;
  }, [items]);

  // Once the last duplicates are merged, drop the filter instead of showing an empty list.
  useEffect(() => {
    if (filter === DUPLICATES && duplicateIds.size === 0) setFilter(null);
  }, [filter, duplicateIds]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter(item => {
      if (query && !item.name.toLowerCase().includes(query)) return false;
      if (filter === USE_SOON) {
        const s = expiryStatus(item.expiry_date);
        return s === 'soon' || s === 'expired';
      }
      if (filter === DUPLICATES) return duplicateIds.has(item.id);
      return !filter || item.category === filter;
    });
    const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name);
    return [...filtered].sort((a, b) => {
      // Keep each pair of duplicates next to each other so they're easy to select.
      if (filter === DUPLICATES || sortMode === 'name') return byName(a, b);
      if (sortMode === 'recent') return (b.added_date || '').localeCompare(a.added_date || '') || byName(a, b);
      if (sortMode === 'value') return (b.total_price || 0) - (a.total_price || 0) || byName(a, b);
      const da = daysUntil(a.expiry_date);
      const db = daysUntil(b.expiry_date);
      if (da === null && db === null) return byName(a, b);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db || byName(a, b);
    });
  }, [items, search, filter, sortMode, duplicateIds]);

  const visibleValue = useMemo(
    () => (filter || search.trim() ? visibleItems.reduce((sum, i) => sum + (i.total_price || 0), 0) : totalValue),
    [visibleItems, filter, search, totalValue],
  );

  // ── Item sheet actions ─────────────────────────────────────────────

  const openItem = (item: InventoryItem) => {
    setActiveId(item.id);
    setUseAmount(Math.min(item.quantity, stepFor(item.unit, item.quantity)));
  };
  const closeSheet = () => setActiveId(null);

  const offerRestock = (item: InventoryItem) => ({
    message: `${item.name} is finished`,
    actionLabel: 'Add to list',
    onAction: async () => {
      await addToShopping({
        name: item.name, quantity: 1, unit: 'pcs', category: item.category,
        estimated_price: 0, source: 'low_stock', recipe_id: null,
      });
      setSnack({ message: `${item.name} added to your shopping list` });
    },
  });

  const handleUse = async (item: InventoryItem, amount: number) => {
    if (!(amount > 0)) return;
    const usedAll = amount >= item.quantity - 0.0005;
    closeSheet();
    await consumeItem(item.id, Math.min(amount, item.quantity));
    setSnack(usedAll ? offerRestock(item) : {
      message: `Used ${formatAmount(amount, item.unit)} of ${item.name}`,
      actionLabel: 'Undo',
      onAction: () => restoreItems([item]),
    });
  };

  const handleDelete = async (toDelete: InventoryItem[]) => {
    closeSheet();
    setSelectedIds([]);
    await deleteItems(toDelete.map(i => i.id));
    setSnack({
      message: toDelete.length === 1 ? `${toDelete[0].name} removed` : `${toDelete.length} items removed`,
      actionLabel: 'Undo',
      onAction: () => restoreItems(toDelete),
    });
  };

  // Freezing pushes the use-by date out by months; taking it out starts a short clock.
  const handleFreezeToggle = async (item: InventoryItem) => {
    closeSheet();
    const freezing = !item.is_frozen;
    const expiry = addDays(freezing ? freezerDays(item.category) : THAWED_DAYS);
    await setFrozen(item.id, freezing, expiry);
    setSnack({
      message: freezing
        ? `${item.name} frozen · good until ${formatDate(expiry)}`
        : `${item.name} out of the freezer · use within ${THAWED_DAYS} days`,
      actionLabel: 'Undo',
      onAction: () => restoreItems([item]),
    });
  };

  const handleAddToShopping = async (item: InventoryItem) => {
    closeSheet();
    await addToShopping({
      name: item.name, quantity: 1, unit: 'pcs', category: item.category,
      estimated_price: 0, source: 'manual', recipe_id: null,
    });
    setSnack({ message: `${item.name} added to your shopping list`, actionLabel: 'View', onAction: () => router.push('/shopping-list') });
  };

  // ── Multi-select actions ───────────────────────────────────────────

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const selectedItems = items.filter(i => selectedIds.includes(i.id));

  const handleBulkCategory = async (category: string) => {
    setShowCategoryMenu(false);
    const count = selectedIds.length;
    await setCategory(selectedIds, category);
    setSelectedIds([]);
    setSnack({ message: `${count} item${count === 1 ? '' : 's'} moved to ${category}` });
  };

  // Merge maths: every selected item expressed in the unit being kept. Items whose
  // unit can't be converted (kg vs pcs) need the amount typed in by hand.
  const mergeUnits = Array.from(new Set(selectedItems.map(i => i.unit)));
  const mergeTarget = mergeUnits.includes(mergeUnit) ? mergeUnit : (selectedItems[0]?.unit || '');
  const mergeRows = selectedItems.map(item => {
    const auto = convertUnit(item.quantity, item.unit, mergeTarget);
    return { item, auto, amount: auto !== null ? auto : (mergeManual[item.id] || 0) };
  });
  const mergeMismatch = mergeRows.some(r => r.auto === null);
  const mergeReady = mergeRows.every(r => r.amount > 0);
  const mergeTotal = mergeRows.reduce((sum, r) => sum + r.amount, 0);

  const openMerge = () => {
    setMergeName(selectedItems[0]?.name || '');
    setMergeUnit(selectedItems[0]?.unit || '');
    setMergeManual({});
    setShowMergeModal(true);
  };

  const confirmMerge = async () => {
    const name = mergeName.trim();
    if (!name || merging || !mergeReady) return;
    setMerging(true);
    try {
      const quantities: Record<string, number> = {};
      for (const row of mergeRows) if (row.auto === null) quantities[row.item.id] = row.amount;
      await mergeItems(selectedIds, name, { unit: mergeTarget, quantities });
    } catch (e: any) {
      Alert.alert('Could not merge', e?.message || 'Something went wrong.');
      return;
    } finally {
      setMerging(false);
    }
    setShowMergeModal(false);
    setSelectedIds([]);
    setMergeName('');
    setSnack({ message: `Merged into ${name}` });
  };

  // ── Rendering ──────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const isSelected = selectedIds.includes(item.id);
    const status = expiryStatus(item.expiry_date);
    return (
      <PressableScale
        onPress={() => (selecting ? toggleSelected(item.id) : openItem(item))}
        onLongPress={() => { if (!selecting) setSelectedIds([item.id]); }}
        scaleTo={0.98}
        accessibilityLabel={`${item.name}, ${formatAmount(item.quantity, item.unit)}`}
        style={[
          styles.itemCard,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
          status === 'expired' && { borderColor: theme.colors.error + '80' },
          isSelected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        {selecting ? (
          <MaterialCommunityIcons
            name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
            size={24}
            color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
            style={{ marginRight: 10 }}
          />
        ) : null}
        <CategoryIcon category={item.category} size={44} />
        <View style={styles.itemInfo}>
          <Text variant="titleMedium" numberOfLines={1} style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {item.name}
          </Text>
          <View style={styles.itemMeta}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatAmount(item.quantity, item.unit)}
            </Text>
            {item.is_frozen ? (
              <View style={[styles.dupPill, { backgroundColor: theme.colors.tertiaryContainer }]}>
                <MaterialCommunityIcons name="snowflake" size={11} color={theme.colors.tertiary} />
                <Text style={{ color: theme.colors.onTertiaryContainer, fontSize: 11, fontWeight: '700', marginLeft: 3 }}>Frozen</Text>
              </View>
            ) : null}
            <ExpiryPill date={item.expiry_date} compact />
            {duplicateIds.has(item.id) ? (
              <View style={[styles.dupPill, { backgroundColor: theme.colors.tertiaryContainer }]}>
                <MaterialCommunityIcons name="content-duplicate" size={11} color={theme.colors.tertiary} />
                <Text style={{ color: theme.colors.onTertiaryContainer, fontSize: 11, fontWeight: '700', marginLeft: 3 }}>Duplicate</Text>
              </View>
            ) : null}
          </View>
        </View>
        {item.total_price > 0 ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
              {currency}{round2(item.total_price).toFixed(2)}
            </Text>
            {item.price_per_unit > 0 && item.unit !== '%' && item.quantity !== 1 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>
                {currency}{round2(item.price_per_unit)}/{item.unit}
              </Text>
            ) : null}
          </View>
        ) : null}
      </PressableScale>
    );
  };

  const filterChips: Array<{ key: string | null; label: string; count: number; color?: string }> = [
    { key: null, label: 'All', count: items.length },
    ...(useSoonItems.length > 0 ? [{ key: USE_SOON, label: 'Use soon', count: useSoonItems.length, color: expiredCount > 0 ? theme.colors.error : WARNING_COLOR }] : []),
    ...(duplicateIds.size > 0 ? [{ key: DUPLICATES, label: 'Duplicates', count: duplicateIds.size, color: theme.colors.tertiary }] : []),
    ...CATEGORIES.filter(c => categoryCounts[c]).map(c => ({ key: c as string, label: c, count: categoryCounts[c], color: CATEGORY_COLORS[c] })),
  ];

  const header = (
    <View>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{filter || search.trim() ? visibleItems.length : items.length}</Text>
          <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>{filter || search.trim() ? 'Shown' : 'Items'}</Text>
        </View>
        <View style={[styles.statCard, { flex: 1.4, backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <Text style={[styles.statValue, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
            {currency}{visibleValue.toFixed(2)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Value</Text>
        </View>
        <PressableScale
          containerStyle={{ flex: 1 }}
          onPress={() => useSoonItems.length > 0 && setFilter(filter === USE_SOON ? null : USE_SOON)}
          style={[
            styles.statCard,
            { flex: undefined, backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
            useSoonItems.length > 0 && { borderColor: (expiredCount > 0 ? theme.colors.error : WARNING_COLOR) + '80' },
          ]}
        >
          <Text style={[styles.statValue, {
            color: useSoonItems.length === 0 ? theme.colors.onSurface : expiredCount > 0 ? theme.colors.error : WARNING_COLOR,
          }]}>
            {useSoonItems.length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>Use soon</Text>
        </PressableScale>
      </View>

      {/* Use-it-up prompt */}
      {soonCount > 0 && !selecting ? (
        <PressableScale
          onPress={() => router.push('/ai-cook?mode=inventory&useUp=1')}
          style={[styles.useUpCard, { backgroundColor: theme.colors.secondaryContainer }]}
          scaleTo={0.98}
        >
          <View style={[styles.useUpIcon, { backgroundColor: theme.colors.secondary }]}>
            <MaterialCommunityIcons name="chef-hat" size={22} color={theme.colors.onSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer, fontWeight: '700' }}>
              Cook with what's about to expire
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer, opacity: 0.85 }} numberOfLines={1}>
              {useSoonItems.filter(i => expiryStatus(i.expiry_date) === 'soon').map(i => i.name).join(', ')}
            </Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={theme.colors.onSecondaryContainer} />
        </PressableScale>
      ) : null}

      {/* Search + sort */}
      <View style={styles.searchRow}>
        <Searchbar
          placeholder="Search your fridge"
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
          inputStyle={styles.searchInput}
          elevation={0}
        />
        <Menu
          visible={showSortMenu}
          onDismiss={() => setShowSortMenu(false)}
          anchor={
            <IconButton
              icon="sort"
              mode="contained-tonal"
              size={22}
              onPress={() => setShowSortMenu(true)}
              accessibilityLabel={`Sort: ${SORT_LABELS[sortMode]}`}
              style={{ margin: 0, borderRadius: 14, width: 48, height: 48 }}
            />
          }
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
            <Menu.Item
              key={mode}
              title={SORT_LABELS[mode]}
              leadingIcon={sortMode === mode ? 'check' : undefined}
              onPress={() => { setSortMode(mode); setShowSortMenu(false); }}
            />
          ))}
        </Menu>
      </View>

      {filter === DUPLICATES && !selecting ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, marginLeft: 4 }}>
          Long-press an item, select its duplicate, then tap the merge icon.
        </Text>
      ) : null}

      {/* Filters */}
      {items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {filterChips.map(chip => {
            const selected = filter === chip.key;
            return (
              <PressableScale
                key={chip.key || 'all'}
                onPress={() => setFilter(selected ? null : chip.key)}
                scaleTo={0.94}
                style={[
                  styles.filterChip,
                  { backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant },
                ]}
              >
                {chip.color && !selected ? <View style={[styles.dot, { backgroundColor: chip.color }]} /> : null}
                <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.onSurface, fontWeight: '600', fontSize: 13 }}>
                  {chip.label}
                </Text>
                <Text style={{ color: selected ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, fontSize: 12, marginLeft: 6, opacity: 0.85 }}>
                  {chip.count}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={visibleItems}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isLoading && items.length > 0} onRefresh={loadItems} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
        ListEmptyComponent={
          items.length === 0 ? (
            <EmptyState
              icon="fridge-outline"
              title="Your fridge is empty"
              subtitle="Scan a grocery receipt to add everything at once, or add items one by one."
              actionLabel="Scan a receipt"
              onAction={() => router.push('/scan')}
              secondaryLabel="Add an item by hand"
              onSecondary={() => router.push('/add-item')}
            />
          ) : (
            <EmptyState
              icon="magnify"
              title="Nothing matches"
              subtitle={search.trim() ? `No items match “${search.trim()}”.` : 'No items in this filter.'}
              actionLabel="Clear filters"
              onAction={() => { setSearch(''); setFilter(null); }}
            />
          )
        }
      />

      {/* Selection bar */}
      {selecting ? (
        <View style={[styles.selectionBar, { backgroundColor: theme.colors.inverseSurface }]}>
          <IconButton icon="close" iconColor={theme.colors.inverseOnSurface} size={20} onPress={() => setSelectedIds([])} accessibilityLabel="Cancel selection" />
          <Text style={{ color: theme.colors.inverseOnSurface, fontWeight: '700', flex: 1 }}>{selectedIds.length} selected</Text>
          {selectedIds.length >= 2 ? (
            <IconButton
              icon="call-merge" iconColor={theme.colors.inverseOnSurface} size={22} accessibilityLabel="Merge selected items"
              onPress={openMerge}
            />
          ) : null}
          <Menu
            visible={showCategoryMenu}
            onDismiss={() => setShowCategoryMenu(false)}
            anchor={
              <IconButton icon="tag-outline" iconColor={theme.colors.inverseOnSurface} size={22} onPress={() => setShowCategoryMenu(true)} accessibilityLabel="Change category" />
            }
          >
            {CATEGORIES.map(c => <Menu.Item key={c} title={c} onPress={() => handleBulkCategory(c)} />)}
          </Menu>
          <IconButton
            icon="delete-outline" iconColor={theme.colors.inverseOnSurface} size={22} accessibilityLabel="Delete selected items"
            onPress={() => handleDelete(selectedItems)}
          />
        </View>
      ) : (
        <View style={styles.fabRow}>
          <FAB
            icon="camera-outline" label="Scan" variant="secondary"
            onPress={() => router.push('/scan')}
            style={[styles.fab, { backgroundColor: theme.colors.secondaryContainer }]}
            color={theme.colors.onSecondaryContainer}
            accessibilityLabel="Scan a receipt"
          />
          <FAB
            icon="plus" label="Add"
            onPress={() => router.push('/add-item')}
            style={[styles.fab, { backgroundColor: theme.colors.primary }]}
            color={theme.colors.onPrimary}
            accessibilityLabel="Add an item"
          />
        </View>
      )}

      {/* Item sheet */}
      <BottomSheet visible={!!active} onDismiss={closeSheet}>
        {active ? (
          <View>
            <View style={styles.sheetHeader}>
              <CategoryIcon category={active.category} size={52} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: '800' }} numberOfLines={2}>{active.name}</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  {formatAmount(active.quantity, active.unit)} · {active.category}{active.is_frozen ? ' · Frozen' : ''}
                  {active.total_price > 0 ? ` · ${currency}${round2(active.total_price).toFixed(2)}` : ''}
                </Text>
                <View style={{ marginTop: 6 }}><ExpiryPill date={active.expiry_date} /></View>
              </View>
            </View>

            <View style={[styles.useBox, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>USED SOME?</Text>
              <View style={styles.stepperRow}>
                <IconButton
                  icon="minus" mode="contained" size={22} accessibilityLabel="Less"
                  onPress={() => setUseAmount(a => round2(Math.max(0, a - stepFor(active.unit, active.quantity))))}
                />
                <NumberField
                  value={useAmount}
                  onChangeValue={setUseAmount}
                  max={active.quantity}
                  suffix={active.unit}
                  dense
                  style={{ flex: 1, textAlign: 'center', backgroundColor: theme.colors.surface }}
                />
                <IconButton
                  icon="plus" mode="contained" size={22} accessibilityLabel="More"
                  onPress={() => setUseAmount(a => round2(Math.min(active.quantity, a + stepFor(active.unit, active.quantity))))}
                />
              </View>
              <View style={styles.useButtons}>
                <Button
                  mode="contained" style={{ flex: 1, borderRadius: 14 }}
                  disabled={!(useAmount > 0)}
                  onPress={() => handleUse(active, useAmount)}
                >
                  Use {formatQty(useAmount)} {active.unit}
                </Button>
                <Button mode="contained-tonal" style={{ flex: 1, borderRadius: 14 }} onPress={() => handleUse(active, active.quantity)}>
                  Finished it
                </Button>
              </View>
            </View>

            <ActionRow icon="pencil-outline" label="Edit details" hint="Name, amount, price, expiry" onPress={() => { const id = active.id; closeSheet(); router.push(`/add-item?editId=${id}`); }} />
            <ActionRow
              icon={active.is_frozen ? 'snowflake-off' : 'snowflake'}
              label={active.is_frozen ? 'Take out of the freezer' : 'Move to the freezer'}
              hint={active.is_frozen
                ? `Sets use-by to ${THAWED_DAYS} days from now`
                : `Keeps about ${Math.round(freezerDays(active.category) / 30)} months · sets a new use-by date`}
              onPress={() => handleFreezeToggle(active)}
              color={theme.colors.tertiary}
            />
            <ActionRow icon="cart-plus" label="Add to shopping list" onPress={() => handleAddToShopping(active)} color={theme.colors.tertiary} />
            <ActionRow icon="delete-outline" label="Remove from fridge" onPress={() => handleDelete([active])} danger />
          </View>
        ) : null}
      </BottomSheet>

      {/* Merge modal */}
      <Portal>
        <Modal
          visible={showMergeModal}
          onDismiss={() => setShowMergeModal(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text variant="titleLarge" style={{ fontWeight: '800', color: theme.colors.onSurface, marginBottom: 6 }}>Merge items</Text>
          <Text variant="bodyMedium" style={{ marginBottom: 14, color: theme.colors.onSurfaceVariant }}>
            Combines {selectedItems.map(i => `${i.name} (${formatAmount(i.quantity, i.unit)})`).join(' + ')} into one item. Amounts and prices are added up.
          </Text>
          <View style={styles.mergeChips}>
            {selectedItems.map(item => (
              <PressableScale
                key={item.id}
                onPress={() => setMergeName(item.name)}
                style={[styles.filterChip, {
                  backgroundColor: mergeName === item.name ? theme.colors.primary : theme.colors.surfaceVariant,
                  borderColor: 'transparent',
                }]}
              >
                <Text style={{ color: mergeName === item.name ? theme.colors.onPrimary : theme.colors.onSurface, fontWeight: '600', fontSize: 13 }}>{item.name}</Text>
              </PressableScale>
            ))}
          </View>
          <TextInput label="Name for the merged item" value={mergeName} onChangeText={setMergeName} mode="outlined" style={{ marginBottom: 14 }} />

          {mergeMismatch ? (
            <View style={[styles.mismatchBox, { backgroundColor: theme.colors.secondaryContainer }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <MaterialCommunityIcons name="scale-unbalanced" size={18} color={theme.colors.secondary} />
                <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer, fontWeight: '800', marginLeft: 8 }}>
                  Unit mismatch
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer, lineHeight: 18, marginBottom: 10 }}>
                These items are measured in {mergeUnits.join(' and ')}, which can't be converted automatically. Choose the unit to keep and enter what the other amount equals.
              </Text>
              <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>KEEP IN</Text>
              <View style={[styles.mergeChips, { marginBottom: 10 }]}>
                {mergeUnits.map(u => (
                  <PressableScale
                    key={u}
                    onPress={() => { setMergeUnit(u); setMergeManual({}); }}
                    accessibilityLabel={`Keep in ${u}`}
                    style={[styles.filterChip, {
                      backgroundColor: mergeTarget === u ? theme.colors.secondary : theme.colors.surface,
                      borderColor: 'transparent',
                    }]}
                  >
                    <Text style={{ color: mergeTarget === u ? theme.colors.onSecondary : theme.colors.onSurface, fontWeight: '700', fontSize: 13 }}>{u}</Text>
                  </PressableScale>
                ))}
              </View>
              {mergeRows.filter(r => r.auto === null).map(({ item }) => (
                <View key={item.id} style={styles.mismatchRow}>
                  <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSecondaryContainer }} numberOfLines={2}>
                    {item.name}: {formatAmount(item.quantity, item.unit)} =
                  </Text>
                  <NumberField
                    value={mergeManual[item.id] || 0}
                    onChangeValue={n => setMergeManual(prev => ({ ...prev, [item.id]: n }))}
                    suffix={mergeTarget}
                    placeholder="0"
                    dense
                    style={{ width: 130, backgroundColor: theme.colors.surface }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 14 }}>
            {mergeReady
              ? `Result: ${formatAmount(Math.round(mergeTotal * 1000) / 1000, mergeTarget)}`
              : 'Enter the converted amount to see the result.'}
          </Text>
          <View style={styles.modalButtons}>
            <Button mode="text" onPress={() => setShowMergeModal(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmMerge} disabled={!mergeName.trim() || merging || !mergeReady} loading={merging}>Merge</Button>
          </View>
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar
        key={snackKey.current}
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={snack?.actionLabel ? 5000 : 2500}
        action={snack?.actionLabel ? { label: snack.actionLabel, onPress: () => snack.onAction?.() } : undefined}
        style={{ marginBottom: 76 }}
      >
        {snack?.message || ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 18, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  useUpCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 14, gap: 12, marginBottom: 12 },
  useUpIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  searchbar: { flex: 1, borderWidth: 1, borderRadius: 14, height: 48 },
  searchInput: { fontSize: 15, minHeight: 0 },
  chipRow: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  itemCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 8 },
  itemInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  dupPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  fabRow: { position: 'absolute', bottom: 16, right: 16, flexDirection: 'row', gap: 10 },
  fab: { borderRadius: 18 },
  selectionBar: {
    position: 'absolute', left: 16, right: 16, bottom: 16, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', paddingRight: 4, elevation: 6,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  useBox: { borderRadius: 18, padding: 14, marginBottom: 10 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  useButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modal: { margin: 20, padding: 24, borderRadius: 24, maxHeight: '85%' },
  mismatchBox: { borderRadius: 16, padding: 14, marginBottom: 12 },
  mismatchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  mergeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
});
