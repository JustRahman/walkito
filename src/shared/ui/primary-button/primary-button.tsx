import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fonts, primaryButton } from '@/shared/config';
import { useColorScheme } from '@/shared/lib/theme';

/**
 * Tall on purpose.
 *
 * A 76pt target is roughly double the platform minimum, and that is the point:
 * on a screen whose whole job is to move you to the next step, the button
 * should be the largest thing your thumb can find without looking. It also
 * gives the label room to sit optically centred rather than crammed.
 */
export const PRIMARY_BUTTON_HEIGHT = 76;
/** Squircle, not a capsule. At h/2 the ends bow out and the button reads as a
 * pill floating in the layout; a little under half keeps it a rounded slab. */
const RADIUS = 32;

const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 160;
/** How far the face shrinks under a finger. Small — a big scale on something
 * this large reads as the screen lurching, not as a press. */
const PRESS_SCALE = 0.975;
const DISABLED_OPACITY = 0.35;

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  /** Trailing glyph, e.g. an arrow. */
  icon?: IconSvgElement;
  /** Dims and stops responding, for a step with nothing chosen yet. */
  disabled?: boolean;
  /**
   * Overrides the face colour, for the one case where the button has to answer
   * for the value above it rather than for the screen it sits on.
   *
   * The label travels with the fill. A fixed dark label would vanish on a deep
   * red and a fixed white one on a bright amber, so the caller hands over the
   * pair or neither — there is no safe default for an arbitrary hue.
   */
  tint?: { fill: string; label: string };
  /**
   * Keeps a disabled button tappable, for a screen that lets a deliberate
   * burst of taps override the wait. The screen owns what the taps mean.
   */
  onDisabledPress?: () => void;
  /** 0–1: how much of a disabled face is filled back in, from the left. */
  charge?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
};

/**
 * The app's committing action: one per screen, always the same shape.
 *
 * Haptics fire on press-*in* rather than on the tap completing. The feedback
 * is meant to confirm the finger landed, so it has to arrive while the finger
 * is still down — firing it on release lands after the navigation has already
 * started and reads as a delayed rattle.
 */
export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled = false,
  tint,
  onDisabledPress,
  charge,
  style,
}: PrimaryButtonProps) {
  const scheme = useColorScheme();
  const theme = tint ?? primaryButton[scheme];

  const pressed = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));
  const chargeStyle = useAnimatedStyle(() => ({
    width: `${(charge?.value ?? 0) * 100}%`,
  }));
  // Always attached once there is a charge, and full opacity when enabled:
  // removing an animated style leaves its last value on the view, which kept
  // "Continue" dimmed after the countdown ended.
  const chargeLabelStyle = useAnimatedStyle(
    () => ({
      opacity: disabled
        ? DISABLED_OPACITY + (1 - DISABLED_OPACITY) * (charge?.value ?? 0)
        : 1,
    }),
    [disabled],
  );
  const tappable = !disabled || onDisabledPress != null;

  return (
    <Animated.View style={[style, faceStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={!tappable}
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          pressed.value = withTiming(1, {
            duration: PRESS_IN_MS,
            easing: Easing.out(Easing.quad),
            reduceMotion: ReduceMotion.System,
          });
        }}
        onPressOut={() => {
          // Timing, never a spring — the face has to settle at rest, not
          // overshoot past its own size.
          pressed.value = withTiming(0, {
            duration: PRESS_OUT_MS,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          });
        }}
        onPress={disabled ? onDisabledPress : onPress}
        style={styles.face}>
        {/* The dimmed fill is its own layer rather than an opacity on the face,
            so the charge can paint the full colour over it. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.fill },
            disabled && styles.disabled,
          ]}
        />
        {disabled && charge != null && (
          <Animated.View style={[styles.charge, { backgroundColor: theme.fill }, chargeStyle]} />
        )}
        <Animated.View
          style={[styles.row, charge != null ? chargeLabelStyle : disabled && styles.disabled]}>
          <Text style={[styles.label, { color: theme.label }]} numberOfLines={1}>
            {label}
          </Text>
          {icon != null && (
            <HugeiconsIcon icon={icon} size={20} color={theme.label} strokeWidth={2.2} />
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    height: PRIMARY_BUTTON_HEIGHT,
    borderRadius: RADIUS,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  charge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    letterSpacing: -0.1,
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
});
