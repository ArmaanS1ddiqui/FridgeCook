import { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Text, TextInput, Button, Menu, Switch, useTheme, Snackbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { CATEGORIES, UNITS } from '../src/constants/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddItemScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { currency } = useSettingsStore();
  const { addItem, updateItem, items } = useInventoryStore();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const editingItem = editId ? items.find(i => i.id === editId) : null;

  const [name, setName] = useState(editingItem?.name || '');
  const [quantity, setQuantity] = useState(editingItem?.quantity?.toString() || '');
  const [unit, setUnit] = useState(editingItem?.unit || 'pcs');
  const [category, setCategory] = useState(editingItem?.category || 'Other');
  const [price, setPrice] = useState(editingItem && editingItem.total_price > 0 ? editingItem.total_price.toString() : '');
  const [expiry, setExpiry] = useState(editingItem?.expiry_date || '');
  const [notes, setNotes] = useState(editingItem?.notes || '');
  const [priceIsTotal, setPriceIsTotal] = useState(true);
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const computedUnitPrice = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const p = parseFloat(price) || 0;
    if (priceIsTotal) return qty > 0 ? round2(p / qty) : 0;
    return p;
  }, [quantity, price, priceIsTotal]);

  const computedTotalPrice = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const p = parseFloat(price) || 0;
    if (priceIsTotal) return round2(p);
    return round2(p * qty);
  }, [quantity, price, priceIsTotal]);

  const handleSave = async () => {
    // Validation with visible errors
    if (!name.trim()) {
      setError('Please enter an item name');
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError('Please enter a valid quantity');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingItem) {
        await updateItem(editingItem.id, {
          name: name.trim(),
          quantity: qty,
          unit,
          category,
          price_per_unit: computedUnitPrice,
          total_price: computedTotalPrice,
          expiry_date: expiry || null,
          notes: notes || null,
        });
      } else {
        await addItem({
          name: name.trim(),
          quantity: qty,
          unit,
          category,
          price_per_unit: computedUnitPrice,
          total_price: computedTotalPrice,
          expiry_date: expiry || null,
          notes: notes || null,
        });
      }
      router.back();
    } catch (e: any) {
      setError(e.message || 'Failed to save item');
      setSaving(false);
    }
  };

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error banner */}
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorContainer }]}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={theme.colors.error} />
              <Text variant="bodyMedium" style={{ color: theme.colors.error, marginLeft: 8, flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* Name */}
          <TextInput
            label="Item Name *"
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            mode="outlined"
            style={styles.input}
            autoFocus={!editingItem}
          />

          {/* Quantity + Unit */}
          <View style={styles.row}>
            <TextInput
              label="Quantity *"
              value={quantity}
              onChangeText={(v) => { setQuantity(v); setError(''); }}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.input, { flex: 1, marginRight: 8 }]}
            />
            <Menu
              visible={showUnitMenu}
              onDismiss={() => setShowUnitMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setShowUnitMenu(true)} style={styles.menuButton}>
                  {unit}
                </Button>
              }
            >
              {UNITS.map(u => (
                <Menu.Item key={u} onPress={() => { setUnit(u); setShowUnitMenu(false); }} title={u} />
              ))}
            </Menu>
          </View>

          {/* Category */}
          <Menu
            visible={showCategoryMenu}
            onDismiss={() => setShowCategoryMenu(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setShowCategoryMenu(true)}
                style={[styles.input, { justifyContent: 'center' }]}
                icon="tag-outline"
              >
                {category}
              </Button>
            }
          >
            {CATEGORIES.map(c => (
              <Menu.Item key={c} onPress={() => { setCategory(c); setShowCategoryMenu(false); }} title={c} />
            ))}
          </Menu>

          {/* Price toggle */}
          <View style={styles.toggleRow}>
            <Text variant="bodySmall" style={{ color: priceIsTotal ? theme.colors.primary : theme.colors.onSurfaceVariant, fontWeight: priceIsTotal ? '700' : '400' }}>
              Total Price
            </Text>
            <Switch
              value={!priceIsTotal}
              onValueChange={(v) => {
                const qty = parseFloat(quantity) || 0;
                const p = parseFloat(price) || 0;
                if (v && qty > 0 && p > 0) {
                  setPrice(round2(p / qty).toString());
                } else if (!v && qty > 0 && p > 0) {
                  setPrice(round2(p * qty).toString());
                }
                setPriceIsTotal(!v);
              }}
              color={theme.colors.primary}
            />
            <Text variant="bodySmall" style={{ color: !priceIsTotal ? theme.colors.primary : theme.colors.onSurfaceVariant, fontWeight: !priceIsTotal ? '700' : '400' }}>
              Unit Price
            </Text>
          </View>

          <TextInput
            label={priceIsTotal ? `Total Price (${currency})` : `Price per unit (${currency})`}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            placeholder="0.00"
          />

          {/* Auto-calc display */}
          {(parseFloat(price) > 0 && parseFloat(quantity) > 0) && (
            <View style={[styles.calcRow, { backgroundColor: theme.colors.primaryContainer }]}>
              <MaterialCommunityIcons name="calculator" size={16} color={theme.colors.primary} />
              <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 6 }}>
                {priceIsTotal
                  ? `${currency}${computedUnitPrice.toFixed(2)} per ${unit}`
                  : `Total: ${currency}${computedTotalPrice.toFixed(2)}`
                }
              </Text>
            </View>
          )}

          {/* Expiry */}
          <Button
            mode="outlined"
            onPress={() => setShowDatePicker(true)}
            icon="calendar"
            contentStyle={{ justifyContent: 'flex-start' }}
            style={styles.input}
          >
            {expiry ? `Expiry: ${expiry.split('-').reverse().join('/')}` : 'Expiry Date — optional'}
          </Button>
          {expiry ? (
            <Button mode="text" onPress={() => setExpiry('')} compact textColor={theme.colors.error} style={{ alignSelf: 'flex-start', marginTop: -8, marginBottom: 8 }}>
              Clear expiry
            </Button>
          ) : null}
          {showDatePicker && (
            <DateTimePicker
              value={expiry ? new Date(expiry) : new Date()}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(event: any, selectedDate?: Date) => {
                setShowDatePicker(false);
                if (event.type === 'set' && selectedDate) {
                  setExpiry(selectedDate.toISOString().split('T')[0]);
                }
              }}
            />
          )}

          {/* Notes */}
          <TextInput
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={2}
          />

          {/* Save Button - BIG and obvious */}
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: theme.colors.primary }]}
            contentStyle={{ paddingVertical: 8 }}
            labelStyle={{ fontSize: 16, fontWeight: '700' }}
            icon={editingItem ? 'check' : 'plus'}
          >
            {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add to Fridge'}
          </Button>

          <Button
            mode="text"
            onPress={() => router.back()}
            style={{ marginTop: 8 }}
            textColor={theme.colors.onSurfaceVariant}
          >
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
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  menuButton: { marginTop: -4, minWidth: 70 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    marginTop: -6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 8,
    borderRadius: 12,
  },
});
