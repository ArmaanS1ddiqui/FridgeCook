import { useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInventoryStore } from '../../src/stores/inventoryStore';
import { useShoppingStore } from '../../src/stores/shoppingStore';
import { expiryStatus } from '../../src/utils/expiry';
import { FadeIn, PressableScale } from '../../src/components/ui';

export default function CookScreen() {
  const theme = useTheme();
  const router = useRouter();
  const inventory = useInventoryStore(s => s.items);
  const shopping = useShoppingStore(s => s.items);

  useFocusEffect(useCallback(() => {
    useInventoryStore.getState().loadItems();
    useShoppingStore.getState().loadItems();
  }, []));

  const expiring = inventory.filter(i => expiryStatus(i.expiry_date) === 'soon');
  const toBuy = shopping.filter(i => !i.is_purchased).length;

  const Tile = ({
    icon, title, description, onPress, tint, container, badge,
  }: {
    icon: string; title: string; description: string; onPress: () => void;
    tint: string; container: string; badge?: string;
  }) => (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={[styles.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: container }]}>
        <MaterialCommunityIcons name={icon as any} size={26} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{title}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: container }]}>
              <Text style={{ color: tint, fontSize: 11, fontWeight: '800' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18, marginTop: 2 }}>{description}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
    </PressableScale>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <FadeIn>
        {/* Hero: the main thing people come here for */}
        <PressableScale
          onPress={() => router.push(expiring.length > 0 ? '/ai-cook?mode=inventory&useUp=1' : '/ai-cook?mode=inventory')}
          scaleTo={0.98}
          style={[styles.hero, { backgroundColor: theme.colors.primary }]}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: theme.colors.onPrimary + '26' }]}>
              <MaterialCommunityIcons name="chef-hat" size={30} color={theme.colors.onPrimary} />
            </View>
            <MaterialCommunityIcons name="arrow-top-right" size={24} color={theme.colors.onPrimary} />
          </View>
          <Text variant="headlineSmall" style={{ color: theme.colors.onPrimary, fontWeight: '800', marginTop: 16 }}>
            What can I cook?
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onPrimary, opacity: 0.9, marginTop: 4, lineHeight: 20 }}>
            {inventory.length === 0
              ? 'Add items to your fridge and get recipes made from exactly what you have.'
              : expiring.length > 0
                ? `Recipes from your ${inventory.length} items, starting with the ${expiring.length} that ${expiring.length === 1 ? 'needs' : 'need'} using up.`
                : `Recipes from the ${inventory.length} item${inventory.length === 1 ? '' : 's'} already in your fridge.`}
          </Text>
        </PressableScale>

        <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>MORE WAYS TO COOK</Text>
        <Tile
          icon="cart-plus"
          title="Cook with a few extras"
          description="Recipes that need 1–4 things you'd pick up from the shop"
          onPress={() => router.push('/ai-cook?mode=extras')}
          tint={theme.colors.tertiary}
          container={theme.colors.tertiaryContainer}
        />
        <Tile
          icon="pot-steam-outline"
          title="Log a dish I cooked"
          description="Pick what you used so your fridge stays accurate"
          onPress={() => router.push('/manual-cook')}
          tint={theme.colors.secondary}
          container={theme.colors.secondaryContainer}
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>SHOPPING</Text>
        <Tile
          icon="cart-outline"
          title="Shopping list"
          description="Tick items off as you shop and they land in your fridge"
          onPress={() => router.push('/shopping-list')}
          tint={theme.colors.primary}
          container={theme.colors.primaryContainer}
          badge={toBuy > 0 ? String(toBuy) : undefined}
        />
        <Tile
          icon="calendar-month-outline"
          title="Plan a monthly shop"
          description="A grocery list built around what you cook and your budget"
          onPress={() => router.push('/monthly-shopping')}
          tint={theme.colors.primary}
          container={theme.colors.primaryContainer}
        />
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  hero: { borderRadius: 26, padding: 20, marginBottom: 8 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  tile: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: 14, gap: 14, marginBottom: 10 },
  tileIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
});
