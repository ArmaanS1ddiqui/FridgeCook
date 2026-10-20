import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import HistoryScreen from './(tabs)/history';

export default function CookingHistoryRoute() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Cooking History',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <HistoryScreen />
    </>
  );
}
