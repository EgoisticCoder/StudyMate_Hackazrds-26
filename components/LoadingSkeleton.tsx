// Loading Skeleton with shimmer animation — redesigned for premium dark mode
// No gradients, opacity-based shimmer using new surface colors

import React from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { useTheme } from '../lib/context';
import { useShimmer } from '../lib/animations';
import { Radii, Spacing } from '../constants/colors';

function ShimmerBlock({ width, height, radius = 8, style }: { width: number | string; height: number; radius?: number; style?: any }) {
  const shimmer = useShimmer();
  const { colors, isDark } = useTheme();

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: isDark ? colors.surface2 : colors.surface3,
          opacity: shimmer,
        },
        style,
      ]}
    />
  );
}

export function ScreenSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* Flat hero shimmer — no gradient */}
      <View style={[st.hero, { backgroundColor: colors.background }]}>
        <ShimmerBlock width={180} height={28} radius={8} style={{ marginBottom: 8 }} />
        <ShimmerBlock width={240} height={14} radius={6} />
      </View>

      {/* Content shimmer blocks */}
      <View style={st.body}>
        {/* Stats row — 3 separate cards */}
        <View style={st.statsRow}>
          <ShimmerBlock width={'31%'} height={80} radius={Radii.card} />
          <ShimmerBlock width={'31%'} height={80} radius={Radii.card} />
          <ShimmerBlock width={'31%'} height={80} radius={Radii.card} />
        </View>

        {/* Card skeletons */}
        <ShimmerBlock width={'100%'} height={120} radius={Radii.card} style={{ marginBottom: 12 }} />
        <ShimmerBlock width={'100%'} height={160} radius={Radii.card} style={{ marginBottom: 12 }} />

        {/* List items */}
        {[0, 1, 2].map(i => (
          <View key={i} style={st.listRow}>
            <ShimmerBlock width={40} height={40} radius={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <ShimmerBlock width={'70%'} height={14} radius={4} />
              <ShimmerBlock width={'40%'} height={10} radius={4} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return <ShimmerBlock width={'100%'} height={height} radius={Radii.card} style={{ marginBottom: 12 }} />;
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 10, padding: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={st.listRow}>
          <ShimmerBlock width={40} height={40} radius={10} />
          <View style={{ flex: 1, gap: 6 }}>
            <ShimmerBlock width={'60%'} height={14} radius={4} />
            <ShimmerBlock width={'35%'} height={10} radius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Generic inline shimmer — backward compat with old LoadingSkeleton API
export function LoadingSkeleton({ width = '100%', height = 16, style }: { width?: number | string; height?: number; style?: any }) {
  return <ShimmerBlock width={width} height={height} radius={4} style={style} />;
}

const st = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 68 : 48,
    paddingBottom: 24,
    paddingHorizontal: Spacing.pageHorizontal,
  },
  body: { padding: 16, gap: 4 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
});
