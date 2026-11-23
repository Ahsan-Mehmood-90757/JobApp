import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { font, radius, space, useColors, type Palette } from '@/theme';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

function toneColors(c: Palette, tone: Tone) {
  switch (tone) {
    case 'primary':
      return { bg: c.primarySoft, fg: c.primary };
    case 'success':
      return { bg: c.successSoft, fg: c.success };
    case 'warning':
      return { bg: c.warningSoft, fg: c.warning };
    case 'danger':
      return { bg: c.dangerSoft, fg: c.danger };
    default:
      return { bg: c.surfaceMuted, fg: c.textSecondary };
  }
}

export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  selectable,
}: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';
  color?: keyof Palette;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const c = useColors();
  const v: Record<string, TextStyle> = {
    title: { fontSize: font.xxl, fontWeight: '700', letterSpacing: -0.4 },
    heading: { fontSize: font.xl, fontWeight: '700', letterSpacing: -0.2 },
    subheading: { fontSize: font.lg, fontWeight: '600' },
    body: { fontSize: font.md, lineHeight: 21 },
    caption: { fontSize: font.sm, lineHeight: 18 },
    label: { fontSize: font.xs, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  };
  const defaultColor: keyof Palette = variant === 'caption' || variant === 'label' ? 'textSecondary' : 'text';
  return (
    <Text numberOfLines={numberOfLines} selectable={selectable} style={[{ color: c[color ?? defaultColor] }, v[variant], style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: 'transparent', fg: c.danger, border: c.border },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: off ? 0.55 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={palette.fg} size="small" /> : icon ? <Text style={{ color: palette.fg, fontSize: small ? 13 : 15 }}>{icon}</Text> : null}
      <Text style={{ color: palette.fg, fontSize: small ? font.sm : font.md, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'primary',
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: Tone;
  onRemove?: () => void;
}) {
  const c = useColors();
  const t = toneColors(c, tone);
  const active = selected ?? false;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: active } : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: active ? t.fg : c.surface,
        borderWidth: 1,
        borderColor: active ? t.fg : c.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: active ? c.primaryText : c.text, fontSize: font.sm, fontWeight: '500' }}>{label}</Text>
      {onRemove ? (
        <Pressable hitSlop={8} onPress={onRemove} accessibilityLabel={`Remove ${label}`}>
          <Text style={{ color: active ? c.primaryText : c.textMuted, fontSize: 15, lineHeight: 16 }}>×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={{ backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm }}>
      <Text style={{ color: t.fg, fontSize: font.xs, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const c = useColors();
  const tone = score >= 70 ? 'success' : score >= 45 ? 'warning' : 'danger';
  const t = toneColors(c, tone);
  const d = size === 'lg' ? 72 : 44;
  return (
    <View
      accessibilityLabel={`Match score ${score} percent`}
      style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: t.bg, borderWidth: size === 'lg' ? 4 : 2, borderColor: t.fg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: size === 'lg' ? 22 : 13 }}>{score}%</Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  style,
  ...props
}: TextInputProps & { label?: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <T variant="caption" style={{ fontWeight: '600' }}>{label}</T> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={{
          backgroundColor: c.surface,
          borderColor: focused ? c.primary : c.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          paddingVertical: props.multiline ? 10 : 11,
          minHeight: props.multiline ? 80 : undefined,
          textAlignVertical: props.multiline ? 'top' : 'center',
          color: c.text,
          fontSize: font.md,
        }}
      />
      {hint ? <T variant="caption" color="textMuted">{hint}</T> : null}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 50, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }) {
  const c = useColors();
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Decrease' : 'Increase'}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={({ pressed }) => ({
        width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
        backgroundColor: c.surfaceMuted, opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 24, color: c.text, lineHeight: 28 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      {btn('−', Math.max(min, value - 1), value <= min)}
      <View style={{ minWidth: 90, alignItems: 'center' }} accessibilityLiveRegion="polite">
        <Text style={{ fontSize: 32, fontWeight: '700', color: c.text }}>{value}</Text>
        {suffix ? <T variant="caption">{suffix}</T> : null}
      </View>
      {btn('+', Math.min(max, value + 1), value >= max)}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
      <T variant="label">{children}</T>
      {action}
    </View>
  );
}

export function Row({ children, gap = space.sm, wrap, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <T variant="subheading" style={{ textAlign: 'center' }}>{title}</T>
      {message ? <T variant="caption" style={{ textAlign: 'center' }}>{message}</T> : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return <EmptyState title="Couldn't load this" message={msg} action={onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : undefined} />;
}
