import { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { CATEGORIES, UNITS, COMMON_UNITS, CATEGORY_COLORS, CATEGORY_ICONS } from '../src/constants/theme';
import { addDays, daysUntil, formatDate, freezerDays, parseDateStr, toDateStr, TYPICAL_SHELF_LIFE, THAWED_DAYS, expiryLabel } from '../src/utils/expiry';
import { formatAmount, formatQty, parseTyped } from '../src/utils/units';
import { normalizeName } from '../src/utils/matching';
import { ChoiceChips, FieldLabel } from '../src/components/ui';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const EXPIRY_PRESETS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

export default function AddItemScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { currency } = useSettingsStore();
  const { addItem, updateItem, items } = useInventoryStore();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const editingItem = editId ? items.find(i => i.id === editId) : null;

  const [name, setName] = useState(editingItem?.name || '');
  const [quantity, setQuantity] = useState(editingItem ? formatQty(editingItem.quantity) : '');
  const [unit, setUnit] = useState(editingItem?.unit || 'pcs');
  const [category, setCategory] = useState(editingItem?.category || 'Other');
  const [price, setPrice] = useState(editingItem && editingItem.total_price > 0 ? String(round2(editingItem.total_price)) : '');
  const [expiry, setExpiry] = useState(editingItem?.expiry_date ? editingItem.expiry_date.slice(0, 10) : '');
  const [notes, setNotes] = useState(editingItem?.notes || '');
  const [frozen, setFrozen] = useState(!!editingItem?.is_frozen);
  const [priceMode, setPriceMode] = useState<'total' | 'unit'>('total');
  const [showAllUnits, setShowAllUnits] = useState(!COMMON_UNITS.includes((editingItem?.unit || 'pcs') as any));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Needed for duplicate detection when this screen is opened before the fridge list has loaded.
    if (items.length === 0) useInventoryStore.getState().loadItems();
  }, []);

  const qty = parseTyped(quantity) ?? 0;
  const priceValue = parseTyped(price) ?? 0;
  const unitPrice = priceMode === 'total' ? (qty > 0 ? priceValue / qty : 0) : priceValue;
  const totalPrice = priceMode === 'total' ? priceValue : priceValue * qty;

  // Flag a likely duplicate; the user decides whether to merge them from the fridge.
  const duplicate = useMemo(() => {
    if (editingItem) return null;
    const key = normalizeName(name);
    if (!key) return null;
    return items.find(i => normalizeName(i.name) === key) || null;
  }, [name, items, editingItem]);

  const suggestedDays = frozen ? null : TYPICAL_SHELF_LIFE[category] ?? null;

  const switchStorage = (value: string) => {
    const toFreezer = value === 'freezer';
    if (toFreezer === frozen) return;
    setFrozen(toFreezer);
    // Freezer: months. Back to the fridge: a couple of days if it was frozen before, else no date.
    setExpiry(toFreezer ? addDays(freezerDays(category)) : editingItem?.is_frozen ? addDays(THAWED_DAYS) : '');
  };
  const expiryDays = daysUntil(expiry);

  const switchPriceMode = (mode: string) => {
    if (mode !== 'total' && mode !== 'unit') return;
    if (mode === priceMode) return;
    if (qty > 0 && priceValue > 0) {
      setPrice(String(round2(mode === 'unit' ? priceValue / qty : priceValue * qty)));
    }
    setPriceMode(mode);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Give the item a name'); return; }
    if (!(qty > 0)) { setError('Enter how much you have'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        quantity: qty,
        unit,
        category,
        price_per_unit: unitPrice,
        total_price: round2(totalPrice),
        expiry_date: expiry || null,
        notes: notes.trim() || null,
        is_frozen: frozen ? 1 : 0,
      };
      if (editingItem) {
        await updateItem(editingItem.id, payload);
      } else {
        await addItem(payload);
      }
      router.back();
    } catch (e: any) {
      setError(e.message || 'Failed to save item');
      setSaving(false);
    }
  };

  const unitOptions = (showAllUnits ? UNITS : COMMON_UNITS).map(u => ({ value: u as string, label: u }));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: editingItem ? 'Edit Item' : 'Add Item',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'web' ? 0 : 80}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={theme.colors.error} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, marginLeft: 8, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            label="What is it?"
            placeholder="e.g. Chicken breast"
            value={name}
            onChangeText={v => { setName(v); setError(''); }}
            mode="outlined"
            style={styles.input}
            autoFocus={!editingItem}
            autoCapitalize="words"
          />

          {duplicate ? (
            <View style={[styles.banner, { backgroundColor: theme.colors.tertiaryContainer }]}>
              <MaterialCommunityIcons name="content-duplicate" size={18} color={theme.colors.tertiary} />
              <Text variant="bodySmall" style={{ color: theme.colors.onTertiaryContainer, marginLeft: 8, flex: 1, lineHeight: 18 }}>
                You already have {duplicate.name} ({formatAmount(duplicate.quantity, duplicate.unit)}). This will be added as a separate item — both get a Duplicate tag in your fridge, and you can long-press to merge them.
              </Text>
            </View>
          ) : null}

          <FieldLabel>How much</FieldLabel>
          <TextInput
            label="Quantity"
            value={quantity}
            onChangeText={v => { setQuantity(v.replace(/[^\d.,]/g, '')); setError(''); }}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            right={<TextInput.Affix text={unit} />}
          />
          <ChoiceChips options={unitOptions} value={unit} onChange={setUnit} style={{ marginBottom: 4 }} />
          <Button mode="text" compact onPress={() => setShowAllUnits(v => !v)} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
            {showAllUnits ? 'Fewer units' : 'More units'}
          </Button>

          <FieldLabel>Category</FieldLabel>
          <ChoiceChips
            options={CATEGORIES.map(c => ({ value: c as string, label: c }))}
            value={category}
            onChange={c => { setCategory(c); if (frozen) setExpiry(addDays(freezerDays(c))); }}
            renderIcon={(c, selected) => (
              <MaterialCommunityIcons
                name={(CATEGORY_ICONS[c] || 'package-variant') as any}
                size={16}
                color={selected ? theme.colors.onPrimary : CATEGORY_COLORS[c]}
              />
            )}
            style={{ marginBottom: 16 }}
          />

          <FieldLabel>Price (optional)</FieldLabel>
          <SegmentedButtons
            value={priceMode}
            onValueChange={switchPriceMode}
            density="small"
            buttons={[
              { value: 'total', label: 'Total paid' },
              { value: 'unit', label: `Per ${unit}` },
            ]}
            style={{ marginBottom: 10 }}
          />
          <TextInput
            label={priceMode === 'total' ? 'Total price' : `Price per ${unit}`}
            value={price}
            onChangeText={v => setPrice(v.replace(/[^\d.,]/g, ''))}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            placeholder="0.00"
            left={<TextInput.Affix text={`${currency} `} />}
          />
          {priceValue > 0 && qty > 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: -8, marginBottom: 14, marginLeft: 4 }}>
              {priceMode === 'total'
                ? `= ${currency}${round2(unitPrice).toFixed(2)} per ${unit}`
                : `= ${currency}${round2(totalPrice).toFixed(2)} in total`}
            </Text>
          ) : null}

          <FieldLabel>Stored in</FieldLabel>
          <SegmentedButtons
            value={frozen ? 'freezer' : 'fridge'}
            onValueChange={switchStorage}
            density="small"
            buttons={[
              { value: 'fridge', label: 'Fridge / cupboard', icon: 'fridge-outline' },
              { value: 'freezer', label: 'Freezer', icon: 'snowflake' },
            ]}
            style={{ marginBottom: 6 }}
          />
          {frozen ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, marginLeft: 4 }}>
              Frozen {category.toLowerCase()} keeps about {Math.round(freezerDays(category) / 30)} months. Use-by is set for you; change it below if you like.
            </Text>
          ) : <View style={{ height: 10 }} />}

          <FieldLabel>Use by</FieldLabel>
          <View style={styles.chipWrap}>
            <ChoiceChips
              options={[
                { value: '', label: 'No date' },
                ...(suggestedDays && !EXPIRY_PRESETS.some(p => p.days === suggestedDays)
                  ? [{ value: addDays(suggestedDays), label: `${suggestedDays} days` }]
                  : []),
                ...EXPIRY_PRESETS.map(p => ({ value: addDays(p.days), label: p.label })),
              ].sort((a, b) => (a.value || '').localeCompare(b.value || ''))}
              value={expiry}
              onChange={setExpiry}
            />
          </View>
          {suggestedDays && !expiry ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, marginLeft: 4 }}>
              {category} usually keeps about {suggestedDays} days.
            </Text>
          ) : null}
          <View style={styles.dateRow}>
            {Platform.OS !== 'web' ? (
              <Button mode="outlined" icon="calendar" onPress={() => setShowDatePicker(true)} style={{ borderRadius: 12 }}>
                {expiry ? formatDate(expiry) : 'Pick a date'}
              </Button>
            ) : expiry ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{formatDate(expiry)}</Text>
            ) : null}
            {expiry ? (
              <Text variant="bodySmall" style={{ color: expiryDays !== null && expiryDays < 0 ? theme.colors.error : theme.colors.onSurfaceVariant, marginLeft: 12 }}>
                {expiryLabel(expiry)}
              </Text>
            ) : null}
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={(expiry && parseDateStr(expiry)) || new Date()}
              mode="date"
              display="default"
              onChange={(event: any, selectedDate?: Date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (event?.type === 'dismissed') { setShowDatePicker(false); return; }
                if (selectedDate) setExpiry(toDateStr(selectedDate));
              }}
            />
          )}

          <TextInput
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            style={[styles.input, { marginTop: 16 }]}
            multiline
          />

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
            contentStyle={{ paddingVertical: 8 }}
            labelStyle={{ fontSize: 16, fontWeight: '700' }}
            icon={editingItem ? 'check' : 'plus'}
          >
            {saving ? 'Saving…' : editingItem ? 'Save changes' : 'Add to fridge'}
          </Button>
          <Button mode="text" onPress={() => router.back()} style={{ marginTop: 4 }} textColor={theme.colors.onSurfaceVariant}>
            Cancel
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  input: { marginBottom: 14 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 14, marginBottom: 14 },
  chipWrap: { marginBottom: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  saveButton: { marginTop: 8, borderRadius: 16 },
});
