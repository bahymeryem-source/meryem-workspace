import { useAudioPlayer } from 'expo-audio';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import Logo from './logo';

SplashScreen.preventAutoHideAsync().catch(() => {});

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  lavender: '#B9A7FF',
  muted: '#8E8E93',
};

const NATIVE = Platform.OS !== 'web';
const MIN_MS = 3000;
const MAX_MS = 7000;

export default function AnimatedSplash({
  ready,
  onDone,
}: {
  ready: boolean;
  onDone: () => void;
}) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(12)).current;
  const blobOpacity = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const leaving = useRef(false);

  const player = useAudioPlayer(
    require('../../assets/sounds/meryem_splash_chime.wav')
  );

  // Play the startup sound once when the splash appears.
  useEffect(() => {
    try {
      player.volume = 0.65;
      player.play();
    } catch (error) {
      console.warn('Splash sound could not be played:', error);
    }
  }, [player]);

  // Keep the existing animation.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(blobOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: NATIVE,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: NATIVE,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: NATIVE,
      }),
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: NATIVE,
          }),
          Animated.timing(textY, {
            toValue: 0,
            duration: 700,
            useNativeDriver: NATIVE,
          }),
        ]),
      ]),
    ]).start();

    const t1 = setTimeout(() => setMinElapsed(true), MIN_MS);
    const t2 = setTimeout(() => setTimedOut(true), MAX_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    blobOpacity,
    logoOpacity,
    logoScale,
    textOpacity,
    textY,
  ]);

  // Fade out after readiness and the minimum splash duration,
  // or when the maximum duration is reached.
  useEffect(() => {
    if (leaving.current) return;
    if (!timedOut && !(ready && minElapsed)) return;

    leaving.current = true;

    Animated.timing(out, {
      toValue: 0,
      duration: 400,
      useNativeDriver: NATIVE,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [ready, minElapsed, timedOut, out, onDone]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: out }]}
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.blob,
          styles.blobMint,
          { opacity: blobOpacity },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.blob,
          styles.blobLavender,
          { opacity: blobOpacity },
        ]}
      />

      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <Logo size={170} showName={false} />
      </Animated.View>

      <Animated.View
        style={[
          styles.textBlock,
          {
            opacity: textOpacity,
            transform: [{ translateY: textY }],
          },
        ]}
      >
        <Text style={styles.name}>MERYEM</Text>
        <Text style={styles.name2}>WORKSPACE</Text>

        <View style={styles.bar}>
          <View style={[styles.seg, { backgroundColor: C.mint }]} />
          <View style={[styles.seg, { backgroundColor: C.lavender }]} />
        </View>

        <Text style={styles.tagline}>
          Your Space. Your Progress.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobMint: {
    width: 340,
    height: 340,
    top: -120,
    left: -100,
    backgroundColor: C.mint,
    opacity: 0.28,
  },
  blobLavender: {
    width: 320,
    height: 320,
    bottom: -110,
    right: -90,
    backgroundColor: C.lavender,
    opacity: 0.28,
  },
  textBlock: {
    alignItems: 'center',
    marginTop: 28,
  },
  name: {
    fontSize: 42,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: 4,
  },
  name2: {
    fontSize: 20,
    fontWeight: '600',
    color: C.ink,
    letterSpacing: 9,
    marginTop: 4,
  },
  bar: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 18,
  },
  seg: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  tagline: {
    fontSize: 16,
    color: C.muted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});