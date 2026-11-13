import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Pressable, StyleSheet, View, ViewStyle, StyleProp,
  KeyboardAvoidingView, Platform, ScrollView, TextStyle,
} from 'react-native';
import { Text, TextInput, useTheme, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_COLORS, CATEGORY_ICONS, WARNING_COLOR, WARNING_COLOR_LIGHT } from '../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expiryLabel, expiryStatus } from '../utils/expiry';
import { formatQty, parseTyped } from '../utils/units';

const useNative = Platform.OS !== 'web';

/** Amber for "use soon" states, readable in the current theme. */
export function useWarningColor(): string {
  return useTheme().dark ? WARNING_COLOR : WARNING_COLOR_LIGHT;
}

// ─── Pressable with a springy scale ────────────────────────────────────

export function PressableScale({
  children, onPress, onLongPress, style, containerStyle, disabled, scaleTo = 0.97, accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Style of the animated content. */
  style?: StyleProp<ViewStyle>;
  /** Style of the outer touch target (use for flex / sizing in the parent layout). */
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: useNative, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={disabled}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      // On web a "button" role renders a <button>, which can't contain the icon buttons some cards hold.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
      style={containerStyle}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Fade + rise on mount ──────────────────────────────────────────────

export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1, duration: 280, delay, easing: Easing.out(Easing.cubic), useNativeDriver: useNative,
    }).start();
  }, []);
  return (
    <Animated.View
      style={[style, {
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Category icon in a tinted circle ──────────────────────────────────

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2.6,
      backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center',
    }}>
      <MaterialCommunityIcons name={(CATEGORY_ICONS[category] || CATEGORY_ICONS.Other) as any} size={size * 0.52} color={color} />
    </View>
  );
}

// ─── Expiry pill ───────────────────────────────────────────────────────

export function ExpiryPill({ date, compact }: { date: string | null | undefined; compact?: boolean }) {
  const theme = useTheme();
  const warning = useWarningColor();
  const status = expiryStatus(date);
  if (status === 'none') return null;
  const color = status === 'expired' ? theme.colors.error : status === 'soon' ? warning : theme.colors.onSurfaceVariant;
  const bg = status === 'ok' ? theme.colors.surfaceVariant : color + '24';
  return (
    <View style={[styles.pill, { backgroundColor: bg }, compact && { paddingHorizontal: 6, paddingVertical: 2 }]}>
      <MaterialCommunityIcons name={status === 'ok' ? 'clock-outline' : 'alert-circle-outline'} size={12} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: '700', marginLeft: 3 }}>{expiryLabel(date)}</Text>
    </View>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────

export function EmptyState({
  icon, title, subtitle, actionLabel, onAction, secondaryLabel, onSecondary,
}: {
  icon: string; title: string; subtitle?: string;
  actionLabel?: string; onAction?: () => void;
  secondaryLabel?: string; onSecondary?: () => void;
}) {
  const theme = useTheme();
  return (
    <FadeIn style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <MaterialCommunityIcons name={icon as any} size={44} color={theme.colors.primary} />
      </View>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700', marginTop: 18, textAlign: 'center' }}>{title}</Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button mode="contained" onPress={onAction} style={{ marginTop: 20, borderRadius: 14 }} contentStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          {actionLabel}
        </Button>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button mode="text" onPress={onSecondary} style={{ marginTop: 4 }}>{secondaryLabel}</Button>
      ) : null}
    </FadeIn>
  );
}

// ─── Bottom sheet ──────────────────────────────────────────────────────

export function BottomSheet({
  visible, onDismiss, children, title,
}: { visible: boolean; onDismiss: () => void; children: ReactNode; title?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  // Keep showing the last content while the sheet slides away, even if the
  // caller has already cleared what it was displaying.
  const content = useRef<{ children: ReactNode; title?: string }>({ children, title });
  if (visible) content.current = { children, title };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, useNativeDriver: useNative, speed: 18, bounciness: 4 }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: useNative })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.backdrop, opacity: progress }]}>
          <Pressable style={{ flex: 1 }} onPress={onDismiss} accessibilityLabel="Close" />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface, paddingBottom: 20 + insets.bottom },
              { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.outlineVariant }]} />
            {content.current.title ? (
              <Text variant="titleLarge" style={{ fontWeight: '700', color: theme.colors.onSurface, marginBottom: 12 }} numberOfLines={2}>
                {content.current.title}
              </Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {content.current.children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Sheet action row ──────────────────────────────────────────────────

export function ActionRow({
  icon, label, hint, onPress, danger, color,
}: { icon: string; label: string; hint?: string; onPress: () => void; danger?: boolean; color?: string }) {
  const theme = useTheme();
  const tint = danger ? theme.colors.error : theme.colors.onSurface;
  return (
    <PressableScale onPress={onPress} style={styles.actionRow} scaleTo={0.98}>
      <View style={[styles.actionIcon, { backgroundColor: (danger ? theme.colors.error : color || theme.colors.primary) + '1F' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={danger ? theme.colors.error : color || theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyLarge" style={{ color: tint, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{hint}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
    </PressableScale>
  );
}

// ─── Selectable chips ──────────────────────────────────────────────────

export function ChoiceChips<T extends string | number | null>({
  options, value, onChange, renderIcon, style,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  renderIcon?: (v: T, selected: boolean) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.chipWrap, style]}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <PressableScale
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            scaleTo={0.94}
            accessibilityLabel={selected ? `${opt.label}, selected` : opt.label}
            style={[
              styles.choiceChip,
              { backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceVariant },
            ]}
          >
            {renderIcon ? renderIcon(opt.value, selected) : null}
            <Text style={{
              color: selected ? theme.colors.onPrimary : theme.colors.onSurface,
              fontWeight: selected ? '700' : '500', fontSize: 13,
            }}>
              {opt.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ─── Numeric input that lets you type decimals ─────────────────────────

/**
 * Keeps the raw text while typing ("2." stays "2.") and reports the parsed
 * number upward, so decimals aren't swallowed mid-keystroke.
 */
export function NumberField({
  label, value, onChangeValue, style, dense, suffix, autoFocus, placeholder, contentStyle, max,
}: {
  /** Largest allowed value; typing more snaps the field back to it. */
  max?: number;
  label?: string;
  value: number;
  onChangeValue: (n: number) => void;
  style?: StyleProp<TextStyle>;
  dense?: boolean;
  suffix?: string;
  autoFocus?: boolean;
  placeholder?: string;
  contentStyle?: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState(value ? formatQty(value) : '');
  const lastReported = useRef(value);

  // Follow outside changes (e.g. +/- buttons) without fighting the keyboard.
  useEffect(() => {
    if (value !== lastReported.current) {
      lastReported.current = value;
      setText(value ? formatQty(value) : '');
    }
  }, [value]);

  return (
    <TextInput
      label={label}
      value={text}
      onChangeText={raw => {
        const cleaned = raw.replace(/[^\d.,]/g, '');
        let n = parseTyped(cleaned) ?? 0;
        if (max !== undefined && n > max) {
          n = max;
          setText(formatQty(max));
        } else {
          setText(cleaned);
        }
        lastReported.current = n;
        onChangeValue(n);
      }}
      keyboardType="decimal-pad"
      mode="outlined"
      dense={dense}
      style={style}
      contentStyle={contentStyle}
      autoFocus={autoFocus}
      placeholder={placeholder}
      right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
    />
  );
}

// ─── Small label above a group of controls ─────────────────────────────

export function FieldLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={{
      color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '700',
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 92, height: 92, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 14 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
});
