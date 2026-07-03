import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  Platform,
  View,
  ViewProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/colors';

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      <View pointerEvents="none" style={styles.backdropGlowPrimary} />
      <View pointerEvents="none" style={styles.backdropGlowAccent} />
      {children}
    </View>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, softShadow.card, style]} {...rest}>
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
          borderRadius: radius.button,
          minHeight: size === 'sm' ? 38 : size === 'lg' ? 54 : 46,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          gap: 8,
        },
        variant === 'primary' && !disabled ? softShadow.button : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 13 : 15, letterSpacing: 0.2, flexShrink: 1 }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, style, onFocus, onBlur, ...rest }: TextInputProps & { label?: string }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 7 }}>
      {label ? <Text style={[typography.label, focused ? { color: colors.primarySoft } : null]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.primary}
        style={[styles.input, focused && styles.inputFocused, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
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
  tone,
}: {
  children: React.ReactNode;
  color?: string;
  textColor?: string;
  tone?: 'success' | 'info' | 'warning' | 'danger';
}) {
  const toneColor = tone === 'success' ? colors.success : tone === 'info' ? colors.info : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : color;
  const content = typeof children === 'string' || typeof children === 'number' ? String(children).toUpperCase() : children;

  return (
    <View
      style={{
        backgroundColor: toneColor + '22',
        borderColor: toneColor + '55',
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {typeof content === 'string' ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ color: textColor === '#fff' ? toneColor : textColor, fontSize: 11, fontWeight: '700', flexShrink: 1 }}
        >
          {content}
        </Text>
      ) : (
        content
      )}
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
    overflow: 'hidden',
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
    paddingVertical: 13,
    minHeight: 50,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.primarySoft,
    backgroundColor: 'rgba(14,165,233,0.10)',
  },
  backdropGlowPrimary: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(14,165,233,0.10)',
    top: -90,
    right: -110,
  },
  backdropGlowAccent: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(99,102,241,0.08)',
    bottom: 80,
    left: -120,
  },
});

export const softShadow = StyleSheet.create({
  card: {
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'ios' ? 0.28 : 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  button: {
    shadowColor: colors.primary,
    shadowOpacity: Platform.OS === 'ios' ? 0.32 : 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
