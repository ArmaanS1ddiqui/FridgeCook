import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import {
  Text, Card, TextInput, Button, SegmentedButtons, RadioButton,
  ActivityIndicator, Banner, Chip, Snackbar,
} from 'react-native-paper';
import { setApiKey, getApiKey, removeApiKey, testApiConnection } from '../src/services/aiService';
import { useSettingsStore, AVAILABLE_MODELS, CURRENCIES, ThemeMode } from '../src/stores/settingsStore';
import { useNetwork } from '../src/hooks/useNetwork';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

export default function AppSettingsScreen() {
  const theme = useTheme();
  const { isConnected } = useNetwork();
  const { themeMode, selectedModel, currency, setThemeMode, setSelectedModel, setCurrency } = useSettingsStore();

  const [apiKey, setApiKeyState] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [snackMessage, setSnackMessage] = useState('');
  const [showSnack, setShowSnack] = useState(false);

  const showConfirmation = (msg: string) => {
    setSnackMessage(msg);
    setShowSnack(true);
  };

  useEffect(() => {
    getApiKey().then(key => {
      if (key) {
        setApiKeyState(key);
        setHasKey(true);
      }
    });
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }
    await setApiKey(apiKey.trim());
    setHasKey(true);
    setTestResult(null);
    showConfirmation('API key saved');
  };

  const handleRemoveKey = async () => {
    Alert.alert('Remove API Key', 'Are you sure? AI features will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeApiKey();
          setApiKeyState('');
          setHasKey(false);
          setTestResult(null);
          showConfirmation('API key removed');
        },
      },
    ]);
  };

  const handleTest = async () => {
    if (!hasKey) {
      Alert.alert('No API Key', 'Save an API key first');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const result = await testApiConnection();
    setTestResult(result);
    setIsTesting(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'App Settings',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        {!isConnected && (
          <Banner
            visible
            icon="wifi-off"
            style={{ backgroundColor: theme.colors.errorContainer, marginBottom: 12, borderRadius: 12 }}
          >
            <Text style={{ color: theme.colors.error }}>
              No internet connection. AI features require network access.
            </Text>
          </Banner>
        )}

        {/* Appearance */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="theme-light-dark" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Appearance
              </Text>
            </View>
            <SegmentedButtons
              value={themeMode}
              onValueChange={(value) => { setThemeMode(value as ThemeMode); showConfirmation('Theme updated'); }}
              buttons={[
                { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
                { value: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
                { value: 'system', label: 'System', icon: 'cellphone' },
              ]}
            />
          </Card.Content>
        </Card>

        {/* Currency */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="currency-usd" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Currency
              </Text>
            </View>
            <View style={styles.currencyRow}>
              {CURRENCIES.map(c => (
                <Chip
                  key={c.name}
                  selected={currency === c.symbol}
                  onPress={() => { setCurrency(c.symbol); showConfirmation('Currency updated to ' + c.name); }}
                  style={[
                    styles.currencyChip,
                    currency === c.symbol
                      ? { backgroundColor: theme.colors.primaryContainer }
                      : { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                  textStyle={currency === c.symbol ? { color: theme.colors.primary, fontWeight: '700' } : { color: theme.colors.onSurface }}
                  compact
                >
                  {c.symbol} {c.name}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* API Configuration */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="key-variant" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                API Key
              </Text>
            </View>
            <TextInput
              label="Gemini API Key"
              value={apiKey}
              onChangeText={setApiKeyState}
              mode="outlined"
              secureTextEntry={!showApiKey}
              right={
                <TextInput.Icon
                  icon={showApiKey ? 'eye-off' : 'eye'}
                  onPress={() => setShowApiKey(!showApiKey)}
                />
              }
              style={styles.input}
              outlineColor={theme.colors.outline}
              activeOutlineColor={theme.colors.primary}
            />
            <View style={styles.buttonRow}>
              <Button mode="contained" onPress={handleSaveKey} style={styles.button} buttonColor={theme.colors.primary}>
                {hasKey ? 'Update' : 'Save'}
              </Button>
              {hasKey && (
                <Button mode="outlined" onPress={handleRemoveKey} textColor={theme.colors.error} style={styles.button}>
                  Remove
                </Button>
              )}
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Free from Google AI Studio (aistudio.google.com)
            </Text>
          </Card.Content>
        </Card>

        {/* Model Selection */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                AI Model
              </Text>
            </View>
            <RadioButton.Group onValueChange={(value) => { setSelectedModel(value); showConfirmation('AI model updated'); }} value={selectedModel}>
              {AVAILABLE_MODELS.map(model => (
                <View key={model.id} style={[styles.radioRow, { borderBottomColor: theme.colors.outline }]}>
                  <RadioButton.Android value={model.id} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>{model.name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{model.id}</Text>
                  </View>
                  {selectedModel === model.id && (
                    <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.primary} />
                  )}
                </View>
              ))}
            </RadioButton.Group>
          </Card.Content>
        </Card>

        {/* Test Connection */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="connection" size={20} color={theme.colors.primary} />
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Test Connection
              </Text>
            </View>
            <Button
              mode="contained"
              onPress={handleTest}
              loading={isTesting}
              disabled={isTesting || !hasKey}
              icon="flash"
              style={styles.testButton}
              buttonColor={theme.colors.primary}
            >
              {isTesting ? 'Testing...' : 'Test API'}
            </Button>
            {testResult && (
              <View style={[
                styles.testResult,
                { backgroundColor: testResult.success ? theme.colors.primaryContainer : theme.colors.errorContainer }
              ]}>
                <MaterialCommunityIcons
                  name={testResult.success ? 'check-circle' : 'alert-circle'}
                  size={18}
                  color={testResult.success ? theme.colors.primary : theme.colors.error}
                />
                <Text variant="bodyMedium" style={{ flex: 1, marginLeft: 8, color: theme.colors.onSurface }}>
                  {testResult.message}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
      <Snackbar
        visible={showSnack}
        onDismiss={() => setShowSnack(false)}
        duration={2000}
        style={{ backgroundColor: theme.colors.inverseSurface }}
        action={{ label: 'OK', onPress: () => setShowSnack(false) }}
      >
        {snackMessage}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { marginBottom: 16, borderRadius: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontWeight: '700', marginLeft: 10 },
  input: { marginBottom: 12 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 12 },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  testButton: { borderRadius: 12, marginBottom: 12 },
  testResult: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currencyChip: { borderRadius: 12 },
});
