import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/colors';

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

type ButtonProps = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Button({
  title,
  variant = 'primary',
  loading,
  fullWidth,
  size = 'md',
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
      ? colors.danger
      : variant === 'secondary'
      ? colors.card
      : 'transparent';
  const border =
    variant === 'ghost' || variant === 'secondary' ? colors.cardBorderStrong : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger' ? '#fff' : colors.text;
  const padV = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const padH = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'ghost' || variant === 'secondary' ? 1 : 0,
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          gap: 8,
        },
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: size === 'sm' ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textSubtle}
        style={[styles.input]}
        {...rest}
      />
    </View>
  );
}

export function H1(props: TextProps) {
  return <Text {...props} style={[typography.h1, props.style]} />;
}
export function H2(props: TextProps) {
  return <Text {...props} style={[typography.h2, props.style]} />;
}
export function H3(props: TextProps) {
  return <Text {...props} style={[typography.h3, props.style]} />;
}
export function Body(props: TextProps) {
  return <Text {...props} style={[typography.body, props.style]} />;
}
export function Muted(props: TextProps) {
  return <Text {...props} style={[typography.bodyMuted, props.style]} />;
}
export function Small(props: TextProps) {
  return <Text {...props} style={[typography.small, props.style]} />;
}
export function Label(props: TextProps) {
  return <Text {...props} style={[typography.label, props.style]} />;
}

export function Pill({
  children,
  color = colors.primary,
  textColor = '#fff',
}: {
  children: React.ReactNode;
  color?: string;
  textColor?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: color + '22',
        borderColor: color + '55',
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: textColor === '#fff' ? color : textColor, fontSize: 11, fontWeight: '700' }}>
        {String(children).toUpperCase()}
      </Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: 8 }}>
      <H3 style={{ textAlign: 'center' }}>{title}</H3>
      {message ? <Muted style={{ textAlign: 'center' }}>{message}</Muted> : null}
    </View>
  );
}

export function Loader() {
  return (
    <View style={{ padding: spacing.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function formatCurrency(cents?: number | null) {
  if (typeof cents !== 'number') return '$0.00';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});
