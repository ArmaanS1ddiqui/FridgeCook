import { Alert } from 'react-native';
import { checkNetwork } from './useNetwork';
import { getApiKey, testApiConnection } from '../services/aiService';

export async function preflightCheck(): Promise<boolean> {
  // Step 1: Network check
  const connected = await checkNetwork();
  if (!connected) {
    Alert.alert(
      'No Internet',
      'You need an internet connection to use AI features. Please check your network and try again.',
      [{ text: 'OK' }]
    );
    return false;
  }

  // Step 2: API key check
  const apiKey = await getApiKey();
  if (!apiKey) {
    Alert.alert(
      'API Key Missing',
      'Please add your Gemini API key in Settings before using AI features.',
      [{ text: 'OK' }]
    );
    return false;
  }

  return true;
}
