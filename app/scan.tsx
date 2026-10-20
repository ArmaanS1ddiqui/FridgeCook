import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { Button, Text, Card, TextInput, IconButton, Chip, ActivityIndicator, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { parseGroceryReceipt } from '../src/services/aiService';
import { useInventoryStore } from '../src/stores/inventoryStore';
import { useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { preflightCheck } from '../src/hooks/usePreflightCheck';
import { useSettingsStore } from '../src/stores/settingsStore';

interface ScannedItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
  selected: boolean;
}

export default function ScanScreen() {
  const theme = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const { addBulkItems } = useInventoryStore();
  const { currency } = useSettingsStore();
  const router = useRouter();

  const pickImage = async (useCamera: boolean) => {
    let result;
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to scan receipts');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: false });
    }

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      await processImage(result.assets[0].uri);
    }
  };

  const processImage = async (uri: string) => {
    setIsProcessing(true);
    try {
      const ready = await preflightCheck();
      if (!ready) { setIsProcessing(false); return; }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const items = await parseGroceryReceipt(base64);
      setScannedItems(items.map(i => ({ ...i, selected: true })));
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process receipt. Make sure your Gemini API key is set in Profile.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItem = (index: number) => {
    setScannedItems(prev => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ));
  };

  const updateScannedItem = (index: number, field: keyof ScannedItem, value: any) => {
    setScannedItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const addSelectedToInventory = async () => {
    const selected = scannedItems.filter(i => i.selected);
    if (selected.length === 0) {
      Alert.alert('No items selected', 'Please select at least one item to add');
      return;
    }

    await addBulkItems(selected.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      price_per_unit: item.quantity > 0 ? item.price / item.quantity : item.price,
      total_price: item.price,
      expiry_date: null,
      notes: 'Added via receipt scan',
    })));

    Alert.alert('Success', `Added ${selected.length} items to your fridge!`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Scan Receipt', headerStyle: { backgroundColor: theme.colors.secondary }, headerTintColor: theme.colors.onSecondary }} />
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
        {!imageUri ? (
          <View style={styles.pickSection}>
            <MaterialCommunityIcons name="receipt" size={80} color={theme.colors.outlineVariant} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text variant="titleMedium" style={[styles.pickTitle, { color: theme.colors.onSurface }]}>Scan a Grocery Receipt</Text>
            <Text variant="bodyMedium" style={[styles.pickDesc, { color: theme.colors.onSurfaceVariant }]}>
              Take a photo or select an image of your grocery receipt to automatically add items to your fridge
            </Text>
            <View style={styles.pickButtons}>
              <Button mode="contained" icon="camera" onPress={() => pickImage(true)} style={styles.pickButton}>
                Take Photo
              </Button>
              <Button mode="outlined" icon="image" onPress={() => pickImage(false)} style={styles.pickButton}>
                From Gallery
              </Button>
            </View>
          </View>
        ) : (
          <>
            <Card style={[styles.imageCard, { backgroundColor: theme.colors.surface }]}>
              <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="contain" />
              <Button mode="text" onPress={() => { setImageUri(null); setScannedItems([]); }}>
                Scan Different Receipt
              </Button>
            </Card>

            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={theme.colors.secondary} />
                <Text variant="bodyMedium" style={[styles.processingText, { color: theme.colors.onSurfaceVariant }]}>
                  Analyzing receipt with AI...
                </Text>
              </View>
            ) : scannedItems.length > 0 ? (
              <>
                <Text variant="titleMedium" style={[styles.reviewTitle, { color: theme.colors.onSurface }]}>
                  Review Items ({scannedItems.filter(i => i.selected).length}/{scannedItems.length} selected)
                </Text>

                {scannedItems.map((item, index) => (
                  <Card
                    key={index}
                    style={[styles.itemCard, { backgroundColor: theme.colors.surface }, !item.selected && styles.itemCardDeselected]}
                    onPress={() => toggleItem(index)}
                  >
                    <Card.Content style={styles.itemContent}>
                      <MaterialCommunityIcons
                        name={item.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={item.selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                      />
                      <View style={styles.itemInfo}>
                        {editingIndex === index ? (
                          <>
                            <TextInput
                              label="Name"
                              value={item.name}
                              onChangeText={v => updateScannedItem(index, 'name', v)}
                              mode="outlined"
                              dense
                              style={styles.editInput}
                            />
                            <View style={styles.editRow}>
                              <TextInput
                                label="Qty"
                                value={item.quantity.toString()}
                                onChangeText={v => updateScannedItem(index, 'quantity', parseFloat(v) || 0)}
                                keyboardType="numeric"
                                mode="outlined"
                                dense
                                style={[styles.editInput, { flex: 1, marginRight: 8 }]}
                              />
                              <TextInput
                                label="Unit"
                                value={item.unit}
                                onChangeText={v => updateScannedItem(index, 'unit', v)}
                                mode="outlined"
                                dense
                                style={[styles.editInput, { flex: 1, marginRight: 8 }]}
                              />
                              <TextInput
                                label="Price"
                                value={item.price.toString()}
                                onChangeText={v => updateScannedItem(index, 'price', parseFloat(v) || 0)}
                                keyboardType="numeric"
                                mode="outlined"
                                dense
                                style={[styles.editInput, { flex: 1 }]}
                              />
                            </View>
                            <Button mode="text" onPress={() => setEditingIndex(null)} compact>Done</Button>
                          </>
                        ) : (
                          <>
                            <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{item.name}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {item.quantity} {item.unit} • {currency}{item.price.toFixed(2)} • {item.category}
                            </Text>
                          </>
                        )}
                      </View>
                      <IconButton
                        icon="pencil"
                        size={18}
                        onPress={() => setEditingIndex(editingIndex === index ? null : index)}
                      />
                    </Card.Content>
                  </Card>
                ))}

                <Button
                  mode="contained"
                  onPress={addSelectedToInventory}
                  style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
                  icon="fridge"
                >
                  Add {scannedItems.filter(i => i.selected).length} Items to Fridge
                </Button>
              </>
            ) : (
              <Text variant="bodyMedium" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, marginTop: 20 }}>
                No items detected. Try a clearer image.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pickSection: { paddingTop: 40 },
  pickTitle: { fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  pickDesc: { textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  pickButtons: { gap: 12 },
  pickButton: { borderRadius: 12 },
  imageCard: { marginBottom: 16, borderRadius: 16, overflow: 'hidden', elevation: 1 },
  receiptImage: { width: '100%', height: 200 },
  processingContainer: { alignItems: 'center', paddingVertical: 40 },
  processingText: { marginTop: 12 },
  reviewTitle: { fontWeight: '700', marginBottom: 12 },
  itemCard: { marginBottom: 8, borderRadius: 16, elevation: 1 },
  itemCardDeselected: { opacity: 0.5 },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemInfo: { flex: 1, marginLeft: 8 },
  editInput: { marginBottom: 4 },
  editRow: { flexDirection: 'row' },
  addButton: { marginTop: 16, borderRadius: 12 },
});
