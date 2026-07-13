// Tab layout — Frosted glass tab bar with localized labels

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { useT } from '../../lib/translations';
import { Platform, View, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';

function TabIcon({
  focused,
  color,
  activeName,
  inactiveName,
  labelsVisible = true,
}: {
  focused: boolean;
  color: string;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
  labelsVisible?: boolean;
}) {
  return (
    <View style={[tabStyles.iconWrap, !labelsVisible && tabStyles.iconWrapNoLabel]}>
      {focused && <View style={[tabStyles.pillIndicator, { backgroundColor: color }]} />}
      <Ionicons name={focused ? activeName : inactiveName} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const tr = useT();
  // Hide labels when the tab bar is too narrow to display them legibly.
  // 6 tabs × ~50px minimum icon width = ~300px; below ~420px things get cramped.
  const { width: SW } = useWindowDimensions();
  const showLabels = SW >= 420;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 16,
          left: 16,
          right: 16,
          backgroundColor: 'transparent',
          borderRadius: 32,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.tabBarBorder,
          borderTopWidth: 0,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.08,
              shadowRadius: 8,
            },
            android: {
              elevation: 8,
            },
            web: {
              boxShadow: isDark ? '0px 4px 8px rgba(0, 0, 0, 0.35)' : '0px 4px 8px rgba(0, 0, 0, 0.08)',
            },
          }),
        },
        tabBarBackground: () => (
          <BlurView
            intensity={85}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: 32, overflow: 'hidden' }]}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginTop: 0,
        },
        tabBarItemStyle: { paddingTop: 4 },
        // Hide label on narrow screens — icon-only mode
        tabBarShowLabel: showLabels,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tab_home'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="home" inactiveName="home-outline" labelsVisible={showLabels} />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: tr('tab_learn'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="book" inactiveName="book-outline" labelsVisible={showLabels} />
          ),
        }}
      />
      <Tabs.Screen
        name="quiz"
        options={{
          title: tr('tab_quiz'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="help-circle" inactiveName="help-circle-outline" labelsVisible={showLabels} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: tr('tab_progress'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="bar-chart" inactiveName="bar-chart-outline" labelsVisible={showLabels} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: tr('tab_compete'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="trophy" inactiveName="trophy-outline" labelsVisible={showLabels} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tr('tab_profile'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="person" inactiveName="person-outline" labelsVisible={showLabels} />
          ),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', height: 36, paddingTop: 6 },
  iconWrapNoLabel: { height: 44, paddingTop: 0 },
  pillIndicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    position: 'absolute',
    top: 0,
  },
});
