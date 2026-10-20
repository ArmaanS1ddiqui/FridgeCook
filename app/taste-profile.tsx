import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
import ProfileScreen from './(tabs)/profile';

export default function TasteProfileRoute() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Taste Profile',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
        }}
      />
      <ProfileScreen />
    </>
  );
}
