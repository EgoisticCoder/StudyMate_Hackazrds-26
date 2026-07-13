// XP SHOP — Browse and purchase rewards with earned XP
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Alert, Animated, Easing, RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme, useAuth } from '../../lib/context';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { SHOP_ITEMS, ShopItem, TIER_COLORS, TIER_LABELS, purchaseItem, getPurchaseHistory, PurchaseRecord } from '../../lib/shop';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { AnimatedScreenWrapper } from '../../components/ui/premium';

type Category = 'all' | 'cheatsheet' | 'break' | 'bonus' | 'cosmetic' | 'premium';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'grid-outline' },
  { key: 'cheatsheet', label: 'Cheatsheets', icon: 'document-text-outline' },
  { key: 'break', label: 'Breaks', icon: 'cafe-outline' },
  { key: 'bonus', label: 'Bonuses', icon: 'flash-outline' },
  { key: 'cosmetic', label: 'Cosmetics', icon: 'color-palette-outline' },
  { key: 'premium', label: 'Premium', icon: 'diamond-outline' },
];

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [category, setCategory] = useState<Category>('all');
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    try {
      const [gamification, history] = await Promise.all([
        getGamificationStats(studentId),
        getPurchaseHistory(studentId),
      ]);
      setStats(gamification);
      setPurchases(history);
    } catch (err) {
      console.error('Shop data fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      fetchData();
      isFirstFocus.current = false;
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handlePurchase = async (item: ShopItem) => {
    if (!studentId) return;

    Alert.alert(
      `Buy ${item.name}?`,
      `This will cost ${item.price} XP. You have ${stats?.xp || 0} XP.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          style: 'default',
          onPress: async () => {
            setPurchasing(item.id);
            try {
              const result = await purchaseItem(studentId, item);
              if (result.success) {
                Alert.alert('🎉 Purchased!', result.message);
                await fetchData();
              } else {
                Alert.alert('Cannot Purchase', result.message);
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Purchase failed');
            } finally {
              setPurchasing(null);
            }
          },
        },
      ]
    );
  };

  const filteredItems = category === 'all'
    ? SHOP_ITEMS
    : SHOP_ITEMS.filter(i => i.category === category);

  const ownedIds = new Set(purchases.map(p => p.itemId));

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>XP Shop</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* XP Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.surface1, borderColor: colors.accentBorder }]}>
          <View style={styles.balanceRow}>
            <View>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                Your Balance
              </Text>
              <View style={styles.balanceValueRow}>
                <Ionicons name="flash" size={24} color={colors.xpGold} />
                <Text style={[styles.balanceValue, { color: colors.xpGold, fontFamily: Fonts.display }]}>
                  {stats?.xp || 0}
                </Text>
                <Text style={[styles.balanceUnit, { color: colors.textTertiary, fontFamily: Fonts.body }]}> XP</Text>
              </View>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="star" size={16} color={colors.accent} />
              <Text style={[styles.levelText, { color: colors.accent, fontFamily: Fonts.display }]}>
                Lv.{stats?.level || 1}
              </Text>
            </View>
          </View>
        </View>

        {/* Category Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat.key ? colors.accent : colors.surface2,
                  borderColor: category === cat.key ? colors.accent : colors.borderSubtle,
                }
              ]}
              onPress={() => setCategory(cat.key)}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={category === cat.key ? colors.textInverse : colors.textSecondary}
              />
              <Text style={{
                color: category === cat.key ? colors.textInverse : colors.textSecondary,
                fontSize: 12,
                fontFamily: Fonts.bodyMedium,
              }}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Items Grid */}
        {filteredItems.map(item => {
          const owned = ownedIds.has(item.id);
          const canAfford = (stats?.xp || 0) >= item.price;
          const levelLocked = item.unlockLevel ? (stats?.level || 1) < item.unlockLevel : false;
          const tierColor = TIER_COLORS[item.tier];
          const isPurchasing = purchasing === item.id;

          return (
            <View
              key={item.id}
              style={[styles.itemCard, {
                backgroundColor: colors.surface1,
                borderColor: owned ? colors.success + '44' : colors.borderSubtle,
                opacity: levelLocked ? 0.5 : 1,
              }]}
            >
              {/* Tier badge */}
              <View style={[styles.tierBadge, { backgroundColor: tierColor + '22' }]}>
                <Text style={{ color: tierColor, fontSize: 9, fontWeight: '700', fontFamily: Fonts.display, letterSpacing: 0.5 }}>
                  {TIER_LABELS[item.tier].toUpperCase()}
                </Text>
              </View>

              <View style={styles.itemRow}>
                {/* Icon */}
                <View style={[styles.itemIcon, { backgroundColor: tierColor + '15' }]}>
                  <Ionicons name={item.icon as any} size={22} color={tierColor} />
                </View>

                {/* Info */}
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemDesc, { color: colors.textTertiary, fontFamily: Fonts.body }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                  {item.unlockLevel && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="lock-closed-outline" size={10} color={colors.textTertiary} />
                      <Text style={{ color: colors.textTertiary, fontSize: 10, fontFamily: Fonts.body }}>
                        Requires Level {item.unlockLevel}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Price / Buy */}
                <View style={styles.itemAction}>
                  {owned ? (
                    <View style={[styles.ownedBadge, { backgroundColor: colors.success + '15' }]}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={{ color: colors.success, fontSize: 10, fontWeight: '600', fontFamily: Fonts.bodyMedium }}>
                        Owned
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.buyBtn, {
                        backgroundColor: canAfford && !levelLocked ? colors.accent : colors.surface3,
                      }]}
                      onPress={() => handlePurchase(item)}
                      disabled={!canAfford || levelLocked || isPurchasing}
                    >
                      {isPurchasing ? (
                        <ActivityIndicator size={12} color={colors.textInverse} />
                      ) : (
                        <>
                          <Ionicons name="flash" size={12} color={canAfford && !levelLocked ? colors.textInverse : colors.textTertiary} />
                          <Text style={{
                            color: canAfford && !levelLocked ? colors.textInverse : colors.textTertiary,
                            fontSize: 12,
                            fontWeight: '700',
                            fontFamily: Fonts.display,
                          }}>
                            {item.price}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Purchase History */}
        {purchases.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              PURCHASE HISTORY
            </Text>
            {purchases.slice(0, 10).map(p => (
              <View key={p.id} style={[styles.historyItem, { borderColor: colors.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontFamily: Fonts.bodyMedium }}>{p.itemName}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 11, fontFamily: Fonts.body }}>
                    {p.date ? new Date(p.date).toLocaleDateString() : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.xpGold, fontSize: 13, fontFamily: Fonts.display }}>
                  -{p.price} XP
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, letterSpacing: -0.4 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  // Balance
  balanceCard: {
    padding: 20, borderRadius: Radii.card, borderWidth: 1,
    marginBottom: 16,
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 12, marginBottom: 4 },
  balanceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceValue: { fontSize: 32, fontWeight: '700' },
  balanceUnit: { fontSize: 16, marginTop: 8 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  levelText: { fontSize: 14, fontWeight: '600' },

  // Categories
  categoriesScroll: { marginBottom: 16 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
  },

  // Items
  itemCard: {
    borderRadius: Radii.card, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10, overflow: 'hidden',
  },
  tierBadge: {
    position: 'absolute', top: 8, right: 8,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  itemDesc: { fontSize: 11, lineHeight: 16 },
  itemAction: { alignItems: 'flex-end' },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  ownedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },

  // Section
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase', marginBottom: 12 },

  // History
  historyItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
