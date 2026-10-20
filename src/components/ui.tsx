import { ReactNode, useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Platform,
    Pressable,
    StyleProp,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from 'react-native';
import Logo from './logo';

export const COLORS = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  red: '#D14343',
  card: '#FFFFFF',
  border: '#E4E4E7',
  muted: '#6B6B73',
};

const NATIVE = Platform.OS !== 'web';

/* ضغطة واضحة: كتصغار وكترجع بارتداد صغير */
export function Press({
  children,
  onPress,
  style,
  outerStyle,
  scaleTo = 0.94,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const down = () =>
    Animated.timing(scale, { toValue: scaleTo, duration: 100, useNativeDriver: NATIVE }).start();
  const up = () =>
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: NATIVE,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      onPressIn={down}
      onPressOut={up}
      style={outerStyle}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ظهور واضح: fade + حركة من تحت + تكبير خفيف */
export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const o = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(28)).current;
  const s = useRef(new Animated.Value(0.96)).current;
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(o, { toValue: 1, duration: 520, delay, easing: ease, useNativeDriver: NATIVE }),
      Animated.timing(y, { toValue: 0, duration: 520, delay, easing: ease, useNativeDriver: NATIVE }),
      Animated.timing(s, { toValue: 1, duration: 520, delay, easing: ease, useNativeDriver: NATIVE }),
    ]).start();
  }, [o, y, s, delay]);
  return (
    <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }, { scale: s }] }]}>
      {children}
    </Animated.View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const off = disabled || loading;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      scaleTo={0.93}
      outerStyle={[{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }, style]}
      style={[
        styles.btn,
        size === 'sm' ? styles.btnSm : styles.btnMd,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        off && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.ink} />
      ) : (
        <Text
          style={[
            styles.label,
            size === 'sm' && { fontSize: 13 },
            variant === 'danger' && { color: COLORS.red },
          ]}
        >
          {label}
        </Text>
      )}
    </Press>
  );
}

export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <FadeIn style={styles.header}>
      <View style={styles.titleRow}>
        <Logo size={34} showName={false} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  btnMd: { height: 50, borderRadius: 16, paddingHorizontal: 24 },
  btnSm: { height: 38, borderRadius: 12, paddingHorizontal: 16 },
  primary: { backgroundColor: COLORS.mint },
  secondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  danger: { backgroundColor: 'rgba(209,67,67,0.08)', borderWidth: 1, borderColor: 'rgba(209,67,67,0.35)' },
  ghost: { backgroundColor: 'transparent' },
  label: { color: COLORS.ink, fontWeight: '800', fontSize: 15 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
});