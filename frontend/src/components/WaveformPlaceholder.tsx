import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { theme } from '../constants/theme';

type WaveformPlaceholderProps = {
  bars?: number[];
  animated?: boolean;
  color?: string;
};

const defaultBars = [6, 14, 9, 22, 7, 19, 26, 11, 20, 10, 24, 8, 17, 9, 20, 13, 25, 6, 18, 15];

export const WaveformPlaceholder = ({
  bars = defaultBars,
  animated = true,
  color = theme.accent,
}: WaveformPlaceholderProps) => {
  const animValues = useRef(bars.map(() => new Animated.Value(0.5 + Math.random() * 0.5))).current;

  useEffect(() => {
    if (!animated) return;

    const animations = animValues.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.25 + Math.random() * 0.4,
            duration: 400 + i * 55,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(anim, {
            toValue: 0.7 + Math.random() * 0.3,
            duration: 400 + i * 55,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      )
    );

    Animated.stagger(40, animations).start();

    return () => animations.forEach((a) => a.stop());
  }, [animated, animValues]);

  return (
    <View style={styles.container}>
      {bars.map((height, index) => (
        <Animated.View
          key={`bar-${index}`}
          style={[
            styles.bar,
            {
              height,
              backgroundColor: color,
              opacity: animValues[index],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 10,
  },
  bar: {
    flex: 1,
    maxWidth: 6,
    borderRadius: 3,
    marginHorizontal: 2,
  },
});
