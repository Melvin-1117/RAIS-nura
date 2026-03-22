import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { theme } from '../constants/theme';

export function SoundCategoryListSkeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View key={i} style={[styles.placeholder, { opacity }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 56,
    backgroundColor: theme.card,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
