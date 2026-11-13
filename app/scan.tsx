import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Animated, Easing, Platform } from 'react-native';
import { Button, Text, TextInput, Switch, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { parseGroceryReceipt, ReceiptItem } from '../src/services/aiService';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { preflightCheck } from '../src/hooks/usePreflightCheck';
import { CATEGORIES, COMMON_UNITS } from '../src/constants/theme';
import { addDays, daysUntil, freezerDays, parseDateStr, TYPICAL_SHELF_LIFE } from '../src/utils/expiry';
import { formatAmount } from '../src/utils/units';
import { normalizeName } from '../src/utils/matching';
import {
  BottomSheet, CategoryIcon, ChoiceChips, FadeIn, FieldLabel, NumberField, PressableScale,
} from '../src/components/ui';

interface ScannedItem extends ReceiptItem {
  key: string;
  selected: boolean;
  /** Going straight into the freezer. */
  frozen?: boolean;
}

type Phase = 'pick' | 'processing' | 'error' | 'review' | 'done';

const SHELF_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'None' },
  { value: 2, label: '2 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 90, label: '3 months' },
  { value: 180, label: '6 months' },
  { value: 240, label: '8 months' },
];

const PROCESSING_MESSAGES = [
  'Reading the receipt…',
  'Picking out the food items…',
  'Matching quantities and prices…',
  'Estimating how long things keep…',
];

// Inline images above this size tend to fail or crawl on mobile data.
const MAX_BASE64_LENGTH = 18_000_000;

let keyCounter = 0;
const nextKey = () => `scan-${++keyCounter}`;

function ScanLine({ height }: { height: number }) {
  const theme = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(y, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderRadius: 2,
        backgroundColor: theme.colors.primary,
        shadowColor: theme.colors.primary, shadowOpacity: 0.9, shadowRadius: 8, elevation: 4,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height - 3] }) }],
      }}
    />
  );
}

export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { addBulkItems, items: inventory } = useInventoryStore();
  const { currency } = useSettingsStore();

  const [phase, setPhase] = useState<Phase>('pick');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [receiptTotals, setReceiptTotals] = useState<number[]>([]);
  const [store, setStore] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [appending, setAppending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);
  const [setExpiry, setSetExpiry] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; duplicates: number } | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  // The last picked image, kept so "Try again" doesn't need a new photo.
  const lastImage = useRef<{ base64: string; mimeType: string } | null>(null);
  // Guards against a slow response landing after the user moved on.
  const requestId = useRef(0);

  useEffect(() => {
    useInventoryStore.getState().loadItems();
  }, []);

  useEffect(() => {
    if (phase !== 'processing') return;
    setMessageIndex(0);
    const timer = setInterval(() => setMessageIndex(i => (i + 1) % PROCESSING_MESSAGES.length), 2600);
    return () => clearInterval(timer);
  }, [phase]);

  const selected = useMemo(() => items.filter(i => i.selected && i.name.trim() && i.quantity > 0), [items]);
  const selectedTotal = useMemo(() => selected.reduce((sum, i) => sum + i.price, 0), [selected]);
  const allTotal = useMemo(() => items.reduce((sum, i) => sum + i.price, 0), [items]);
  const receiptTotal = receiptTotals.length > 0 && receiptTotals.length === photoCount
    ? receiptTotals.reduce((a, b) => a + b, 0)
    : null;
  const editing = items.find(i => i.key === editingKey) || null;

  const existingMatch = (item: ReceiptItem) => {
    const key = normalizeName(item.name);
    if (!key) return null;
    return inventory.find(inv => normalizeName(inv.name) === key) || null;
  };

  const runScan = async (base64: string, mimeType: string, append: boolean) => {
    const myRequest = ++requestId.current;
    lastImage.current = { base64, mimeType };
    setErrorMessage('');
    setAppending(append);
    setPhase('processing');

    try {
      const ready = await preflightCheck();
      if (myRequest !== requestId.current) return;
      if (!ready) {
        setErrorMessage('AI scanning needs an internet connection and a Gemini API key (Settings → App Settings).');
        setPhase(append && items.length > 0 ? 'review' : 'error');
        return;
      }
      if (base64.length > MAX_BASE64_LENGTH) {
        throw new Error('This photo is too large to send. Crop it to just the receipt, or take the photo from a little further away.');
      }

      const receipt = await parseGroceryReceipt(base64, mimeType);
      if (myRequest !== requestId.current) return;

      if (receipt.items.length === 0) {
        setErrorMessage(append
          ? 'No food items were found in that photo.'
          : "Couldn't find any food items. Make sure the receipt is flat, well lit and fully in frame.");
        setPhase(append && items.length > 0 ? 'review' : 'error');
        return;
      }

      const scanned = receipt.items.map(i => ({ ...i, key: nextKey(), selected: true }));
      setItems(prev => (append ? [...prev, ...scanned] : scanned));
      setPhotoCount(prev => (append ? prev + 1 : 1));
      setReceiptTotals(prev => {
        const base = append ? prev : [];
        return receipt.total !== null ? [...base, receipt.total] : base;
      });
      if (!append || !store) setStore(receipt.store);
      if (!append) {
        // Count shelf life from the day of purchase when the receipt is recent.
        const age = receipt.date ? daysUntil(receipt.date) : null;
        setPurchaseDate(age !== null && age <= 0 && age >= -30 ? receipt.date : null);
      }
      setPhase('review');
    } catch (error: any) {
      if (myRequest !== requestId.current) return;
      setErrorMessage(error?.message || 'Failed to read the receipt. Please try again.');
      setPhase(append && items.length > 0 ? 'review' : 'error');
    }
  };

  const pickImage = async (useCamera: boolean, append = false) => {
    try {
      let picked: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Camera permission needed',
            permission.canAskAgain === false
              ? 'Camera access is turned off for FridgeCook. Enable it in your phone settings, or pick a photo from the gallery instead.'
              : 'Allow camera access to photograph receipts, or pick a photo from the gallery instead.',
          );
          return;
        }
        picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
      } else {
        picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
      }

      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      setImageUri(asset.uri);
      let base64 = asset.base64 || null;
      // On Android/iOS the picker re-encodes the base64 as JPEG whatever the source file was,
      // so label it as JPEG; only trust the reported type when we read the raw file ourselves.
      const reported = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
      const mimeType = base64 && Platform.OS !== 'web' ? 'image/jpeg' : reported;

      if (!base64 && asset.uri.startsWith('data:')) {
        base64 = asset.uri.slice(asset.uri.indexOf(',') + 1);
      }
      if (!base64) {
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      if (!base64) throw new Error('Could not read the selected image.');

      await runScan(base64, mimeType, append);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Could not open the image. Please try again.');
      setPhase(append && items.length > 0 ? 'review' : 'error');
    }
  };

  const choosePhotoSource = (append: boolean) => {
    if (Platform.OS === 'web') { pickImage(false, append); return; }
    Alert.alert(append ? 'Add another photo' : 'Scan receipt', 'Where is the receipt?', [
      { text: 'Take Photo', onPress: () => pickImage(true, append) },
      { text: 'Gallery', onPress: () => pickImage(false, append) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const reset = () => {
    requestId.current++;
    lastImage.current = null;
    setImageUri(null);
    setItems([]);
    setReceiptTotals([]);
    setPhotoCount(0);
    setStore(null);
    setPurchaseDate(null);
    setErrorMessage('');
    setResult(null);
    setPhase('pick');
  };

  const updateItem = (key: string, patch: Partial<ScannedItem>) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  };

  const addBlankItem = () => {
    const key = nextKey();
    setItems(prev => [...prev, {
      key, selected: true, name: '', quantity: 1, unit: 'pcs', price: 0, category: 'Other', shelfLifeDays: null,
    }]);
    setEditingKey(key);
  };

  const closeEditor = () => {
    // Drop rows that were added and left without a name.
    setItems(prev => prev.filter(i => i.key !== editingKey || i.name.trim()));
    setEditingKey(null);
  };

  const allSelected = items.length > 0 && selected.length === items.length;

  const save = async () => {
    const toAdd = selected.filter(i => i.name.trim() && i.quantity > 0);
    if (toAdd.length === 0) {
      Alert.alert('Nothing to add', 'Select at least one item with a name and quantity.');
      return;
    }
    setSaving(true);
    try {
      const duplicates = toAdd.filter(item => existingMatch(item)).length;
      await addBulkItems(toAdd.map(item => ({
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        price_per_unit: item.quantity > 0 ? item.price / item.quantity : 0,
        total_price: item.price,
        // Frozen items always get a date (counted from today, when they go in the freezer).
        expiry_date: item.frozen
          ? addDays(item.shelfLifeDays || freezerDays(item.category))
          : setExpiry && item.shelfLifeDays
            ? addDays(item.shelfLifeDays, (purchaseDate && parseDateStr(purchaseDate)) || new Date())
            : null,
        is_frozen: item.frozen ? 1 : 0,
        notes: store ? `Receipt scan · ${store}` : 'Added via receipt scan',
      })));
      setResult({ added: toAdd.length, duplicates });
      setPhase('done');
    } catch (error: any) {
      Alert.alert('Could not save', error?.message || 'Something went wrong while saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Screens ────────────────────────────────────────────────────────

  const renderPick = () => (
    <FadeIn style={styles.center}>
      <View style={[styles.heroIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <MaterialCommunityIcons name="receipt-text-outline" size={56} color={theme.colors.primary} />
      </View>
      <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>Scan a grocery receipt</Text>
      <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Snap the receipt and every food item lands in your fridge with its price, category and an estimated expiry date.
      </Text>

      <View style={[styles.tips, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        {[
          ['white-balance-sunny', 'Good light, no shadows across the text'],
          ['crop-free', 'Fill the frame with the receipt, laid flat'],
          ['arrow-expand-vertical', 'Long receipt? Scan it in two photos'],
        ].map(([icon, text]) => (
          <View key={text} style={styles.tipRow}>
            <MaterialCommunityIcons name={icon as any} size={18} color={theme.colors.primary} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginLeft: 10, flex: 1 }}>{text}</Text>
          </View>
        ))}
      </View>

      <Button
        mode="contained" icon="camera" onPress={() => pickImage(true)}
        style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
      >
        Take Photo
      </Button>
      <Button
        mode="contained-tonal" icon="image-multiple-outline" onPress={() => pickImage(false)}
        style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
      >
        Choose from Gallery
      </Button>
    </FadeIn>
  );

  const renderProcessing = () => (
    <View style={styles.center}>
      <View style={[styles.previewFrame, { backgroundColor: theme.colors.surfaceVariant }]}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
        <ScanLine height={320} />
      </View>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700', marginTop: 24 }}>
        {PROCESSING_MESSAGES[messageIndex]}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
        This usually takes 5–20 seconds
      </Text>
      <Button
        mode="text"
        style={{ marginTop: 16 }}
        textColor={theme.colors.onSurfaceVariant}
        onPress={() => {
          // Cancelling an extra photo keeps the items already scanned.
          if (appending && items.length > 0) { requestId.current++; setPhase('review'); } else reset();
        }}
      >
        Cancel
      </Button>
    </View>
  );

  const renderError = () => (
    <FadeIn style={styles.center}>
      {imageUri ? (
        <View style={[styles.previewFrame, { height: 180, backgroundColor: theme.colors.surfaceVariant }]}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
        </View>
      ) : null}
      <View style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={22} color={theme.colors.error} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, marginLeft: 10, flex: 1, lineHeight: 20 }}>
          {errorMessage || 'Something went wrong.'}
        </Text>
      </View>
      {lastImage.current ? (
        <Button
          mode="contained" icon="refresh"
          onPress={() => lastImage.current && runScan(lastImage.current.base64, lastImage.current.mimeType, false)}
          style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
        >
          Try Again
        </Button>
      ) : null}
      <Button
        mode="contained-tonal" icon="camera-retake-outline" onPress={reset}
        style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
      >
        Use a Different Photo
      </Button>
      <Button mode="text" onPress={() => router.replace('/add-item')} style={{ marginTop: 4 }}>
        Add items by hand instead
      </Button>
    </FadeIn>
  );

  const renderTotalsCheck = () => {
    if (receiptTotal === null) return null;
    const diff = Math.abs(receiptTotal - allTotal);
    const matches = diff <= Math.max(0.05, receiptTotal * 0.01);
    return (
      <View style={[styles.checkRow, { backgroundColor: matches ? theme.colors.primaryContainer : theme.colors.secondaryContainer }]}>
        <MaterialCommunityIcons
          name={matches ? 'check-decagram' : 'information-outline'} size={18}
          color={matches ? theme.colors.primary : theme.colors.secondary}
        />
        <Text variant="bodySmall" style={{ flex: 1, marginLeft: 8, lineHeight: 17, color: matches ? theme.colors.onPrimaryContainer : theme.colors.onSecondaryContainer }}>
          {matches
            ? `Items add up to the receipt total (${currency}${receiptTotal.toFixed(2)}).`
            : `Items add up to ${currency}${allTotal.toFixed(2)} but the receipt says ${currency}${receiptTotal.toFixed(2)}. Non-food items are skipped, so a gap is normal — otherwise check for a missed or misread line.`}
        </Text>
      </View>
    );
  };

  const renderReview = () => (
    <>
      <ScrollView contentContainerStyle={styles.reviewContent} keyboardShouldPersistTaps="handled">
        <FadeIn>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }} numberOfLines={1}>
                {store || 'Receipt'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {items.length} item{items.length === 1 ? '' : 's'} found{photoCount > 1 ? ` across ${photoCount} photos` : ''}
              </Text>
              <Text variant="titleLarge" style={{ color: theme.colors.primary, fontWeight: '800', marginTop: 4 }}>
                {currency}{allTotal.toFixed(2)}
              </Text>
            </View>
          </View>

          {renderTotalsCheck()}

          {errorMessage ? (
            <View style={[styles.checkRow, { backgroundColor: theme.colors.errorContainer }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.colors.error} />
              <Text variant="bodySmall" style={{ flex: 1, marginLeft: 8, color: theme.colors.onErrorContainer }}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={[styles.toggleRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <MaterialCommunityIcons name="calendar-clock" size={20} color={theme.colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>Set estimated expiry dates</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>For fresh items only. Tap an item to adjust.</Text>
            </View>
            <Switch value={setExpiry} onValueChange={setSetExpiry} color={theme.colors.primary} />
          </View>

          <View style={styles.listHeader}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
              {selected.length} OF {items.length} SELECTED
            </Text>
            <Button
              compact mode="text"
              onPress={() => setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })))}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
          </View>
        </FadeIn>

        {items.map(item => {
          const match = existingMatch(item);
          return (
            <View
              key={item.key}
              style={[
                styles.itemCard,
                { backgroundColor: theme.colors.surface, borderColor: item.selected ? theme.colors.outlineVariant : 'transparent' },
                !item.selected && { opacity: 0.45 },
              ]}
            >
              <PressableScale onPress={() => updateItem(item.key, { selected: !item.selected })} scaleTo={0.85} style={styles.checkbox} accessibilityLabel={item.selected ? 'Deselect item' : 'Select item'}>
                <MaterialCommunityIcons
                  name={item.selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={26}
                  color={item.selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
              </PressableScale>
              <PressableScale onPress={() => setEditingKey(item.key)} containerStyle={{ flex: 1 }} style={styles.itemBody} scaleTo={0.98} accessibilityLabel={`Edit ${item.name}`}>
                <CategoryIcon category={item.category} size={38} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }} numberOfLines={2}>
                    {item.name || 'Unnamed item'}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                    {formatAmount(item.quantity, item.unit)} · {item.category}
                    {item.frozen
                      ? ` · freezer ~${Math.round((item.shelfLifeDays || freezerDays(item.category)) / 30)} mo`
                      : setExpiry && item.shelfLifeDays ? ` · keeps ~${item.shelfLifeDays}d` : ''}
                  </Text>
                  {match ? (
                    <View style={[styles.dupPill, { backgroundColor: theme.colors.tertiaryContainer }]}>
                      <MaterialCommunityIcons name="content-duplicate" size={12} color={theme.colors.tertiary} />
                      <Text style={{ color: theme.colors.onTertiaryContainer, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                        Already in fridge · {formatAmount(match.quantity, match.unit)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="titleSmall" style={{ color: item.price > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant, fontWeight: '700' }}>
                    {item.price > 0 ? `${currency}${item.price.toFixed(2)}` : 'No price'}
                  </Text>
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.onSurfaceVariant} style={{ marginTop: 4 }} />
                </View>
              </PressableScale>
            </View>
          );
        })}

        <View style={styles.reviewActions}>
          <Button mode="outlined" icon="plus" onPress={addBlankItem} style={styles.secondaryButton}>Add missed item</Button>
          <Button mode="outlined" icon="camera-plus-outline" onPress={() => choosePhotoSource(true)} style={styles.secondaryButton}>
            Add another photo
          </Button>
        </View>
        <Button mode="text" onPress={reset} textColor={theme.colors.onSurfaceVariant} style={{ marginTop: 4 }}>
          Start over
        </Button>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>
        <Button
          mode="contained" icon="fridge-outline" onPress={save}
          loading={saving} disabled={saving || selected.length === 0}
          style={{ borderRadius: 16 }} contentStyle={{ paddingVertical: 8 }} labelStyle={styles.bigButtonLabel}
        >
          {selected.length === 0
            ? 'Select items to add'
            : `Add ${selected.length} item${selected.length === 1 ? '' : 's'} · ${currency}${selectedTotal.toFixed(2)}`}
        </Button>
      </View>
    </>
  );

  const renderDone = () => (
    <FadeIn style={styles.center}>
      <SuccessBadge />
      <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>Fridge stocked</Text>
      <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        {result
          ? [
              `${result.added} item${result.added === 1 ? '' : 's'} added`,
              result.duplicates > 0
                ? `${result.duplicates} already in your fridge — ${result.duplicates === 1 ? 'it is' : 'they are'} marked Duplicate there, long-press to merge`
                : '',
            ].filter(Boolean).join('. ')
          : ''}
      </Text>
      <Button
        mode="contained" icon="fridge-outline" onPress={() => router.back()}
        style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
      >
        Back to Fridge
      </Button>
      <Button
        mode="contained-tonal" icon="receipt-text-plus-outline" onPress={reset}
        style={styles.bigButton} contentStyle={styles.bigButtonContent} labelStyle={styles.bigButtonLabel}
      >
        Scan Another Receipt
      </Button>
    </FadeIn>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: phase === 'review' ? 'Review Items' : 'Scan Receipt',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {phase === 'review' ? renderReview() : (
          <ScrollView contentContainerStyle={styles.content}>
            {phase === 'pick' && renderPick()}
            {phase === 'processing' && renderProcessing()}
            {phase === 'error' && renderError()}
            {phase === 'done' && renderDone()}
          </ScrollView>
        )}
      </View>

      <BottomSheet visible={!!editing} onDismiss={closeEditor} title="Edit item">
        {editing ? (
          <View>
            <TextInput
              label="Name" value={editing.name} mode="outlined" style={styles.field}
              onChangeText={v => updateItem(editing.key, { name: v })}
              autoFocus={!editing.name}
            />
            <View style={styles.fieldRow}>
              <NumberField
                label="Quantity" value={editing.quantity} style={[styles.field, { flex: 1 }]}
                onChangeValue={n => updateItem(editing.key, { quantity: n })}
              />
              <NumberField
                label={`Total price (${currency})`} value={editing.price} style={[styles.field, { flex: 1 }]}
                onChangeValue={n => updateItem(editing.key, { price: n })}
              />
            </View>

            <FieldLabel>Unit</FieldLabel>
            <ChoiceChips
              options={COMMON_UNITS.map(u => ({ value: u as string, label: u }))}
              value={editing.unit}
              onChange={u => updateItem(editing.key, { unit: u })}
              style={{ marginBottom: 12 }}
            />

            <FieldLabel>Category</FieldLabel>
            <ChoiceChips
              options={CATEGORIES.map(c => ({ value: c as string, label: c }))}
              value={editing.category}
              onChange={c => updateItem(editing.key, {
                category: c as ScannedItem['category'],
                ...(editing.frozen ? { shelfLifeDays: freezerDays(c) } : {}),
              })}
              style={{ marginBottom: 12 }}
            />

            <FieldLabel>Stored in</FieldLabel>
            <ChoiceChips
              options={[{ value: 'fridge', label: 'Fridge / cupboard' }, { value: 'freezer', label: 'Freezer' }]}
              value={editing.frozen ? 'freezer' : 'fridge'}
              onChange={v => updateItem(editing.key, v === 'freezer'
                ? { frozen: true, shelfLifeDays: freezerDays(editing.category) }
                : { frozen: false, shelfLifeDays: TYPICAL_SHELF_LIFE[editing.category] ?? null })}
              style={{ marginBottom: 12 }}
            />

            <FieldLabel>Keeps for</FieldLabel>
            <ChoiceChips
              options={
                editing.shelfLifeDays !== null && !SHELF_OPTIONS.some(o => o.value === editing.shelfLifeDays)
                  ? [...SHELF_OPTIONS, { value: editing.shelfLifeDays, label: `${editing.shelfLifeDays} days` }]
                  : SHELF_OPTIONS
              }
              value={editing.shelfLifeDays}
              onChange={d => updateItem(editing.key, { shelfLifeDays: d })}
              style={{ marginBottom: 16 }}
            />

            <View style={styles.fieldRow}>
              <Button
                mode="outlined" icon="delete-outline" textColor={theme.colors.error} style={{ flex: 1, borderRadius: 14 }}
                onPress={() => {
                  const key = editing.key;
                  setEditingKey(null);
                  setItems(prev => prev.filter(i => i.key !== key));
                }}
              >
                Remove
              </Button>
              <Button mode="contained" icon="check" style={{ flex: 1, borderRadius: 14 }} onPress={closeEditor}>
                Done
              </Button>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

function SuccessBadge() {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 10, bounciness: 14 }).start();
  }, []);
  return (
    <Animated.View style={[styles.heroIcon, { backgroundColor: theme.colors.primary, transform: [{ scale }] }]}>
      <MaterialCommunityIcons name="check-bold" size={56} color={theme.colors.onPrimary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  center: { alignItems: 'stretch', paddingTop: 16 },
  heroIcon: { width: 112, height: 112, borderRadius: 38, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  title: { fontWeight: '800', textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 22 },
  tips: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12, marginBottom: 20 },
  tipRow: { flexDirection: 'row', alignItems: 'center' },
  bigButton: { borderRadius: 16, marginBottom: 12 },
  bigButtonContent: { paddingVertical: 8 },
  bigButtonLabel: { fontSize: 16, fontWeight: '700' },
  previewFrame: { height: 320, borderRadius: 24, overflow: 'hidden', alignSelf: 'stretch' },
  previewImage: { width: '100%', height: '100%' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 16, marginVertical: 20 },
  reviewContent: { padding: 16, paddingBottom: 24 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 20, borderWidth: 1, gap: 14, marginBottom: 10 },
  thumb: { width: 64, height: 84, borderRadius: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 14, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 6 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2, paddingLeft: 4 },
  itemCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, marginBottom: 8, paddingVertical: 10, paddingRight: 14 },
  checkbox: { paddingHorizontal: 12, paddingVertical: 8 },
  itemBody: { flexDirection: 'row', alignItems: 'center' },
  dupPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  secondaryButton: { borderRadius: 14, flexGrow: 1 },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1 },
  field: { marginBottom: 12 },
  fieldRow: { flexDirection: 'row', gap: 10 },
});
