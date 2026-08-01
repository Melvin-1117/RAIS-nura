import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../constants/theme';

export type NavTab = 'home' | 'live' | 'profiles' | 'settings';

type BottomNavBarProps = {
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
};

const tabs: { key: NavTab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'live', label: 'Live', icon: '📡' },
  { key: 'profiles', label: 'Profiles', icon: '👥' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export const BottomNavBar = ({ activeTab, onNavigate }: BottomNavBarProps) => {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onNavigate(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.tabActive,
              pressed && { transform: [{ scale: 0.9 }] },
            ]}
          >
            <Text style={[styles.icon, isActive && styles.iconActive]}>{tab.icon}</Text>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84,
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 10,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xl,
  },
  tabActive: {
    backgroundColor: 'rgba(192, 193, 255, 0.1)',
  },
  icon: {
    fontSize: 20,
    color: colors.onSurfaceVariant,
  },
  iconActive: {
    color: colors.primary,
  },
  label: {
    ...typography.labelMd,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
