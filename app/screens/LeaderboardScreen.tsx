// COMPETITION & LEADERBOARD SCREEN — Podium view, ranked rows with proportional XP bars,
// medal icons, premium social settings.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Platform, Animated, Easing, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import {
  getFriendsList, getLeaderboard, FriendProfile,
  sendFriendRequest, acceptFriendRequest,
} from '../../lib/social';
import { EmptyState, SurfaceCard, Chip } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';

const MEDAL_COLORS = ['#D4AF37', '#A8A8A8', '#CD7F32'] as const;
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'] as const;

export default function LeaderboardScreen({ isTab = false }: { isTab?: boolean }) {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'friends'>('leaderboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<{
    accepted: FriendProfile[];
    pendingIn: FriendProfile[];
    pendingOut: FriendProfile[];
  }>({ accepted: [], pendingIn: [], pendingOut: [] });

  const [friendEmail, setFriendEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

  // Podium bar animations
  const podiumAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const fetchData = useCallback(async (silent = false) => {
    if (!studentId) return;
    if (!silent) setLoading(true);
    try {
      const [gamification, friendsData, leaderboardData] = await Promise.all([
        getGamificationStats(studentId),
        getFriendsList(studentId),
        getLeaderboard(studentId),
      ]);
      setStats(gamification);
      setFriends(friendsData);
      setLeaderboard(leaderboardData);
    } catch (err) {
      console.error('Error fetching social stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  const isFirstFocus = React.useRef(true);
  useFocusEffect(
    useCallback(() => {
      fetchData(!isFirstFocus.current);
      isFirstFocus.current = false;
    }, [fetchData])
  );

  // Animate podium bars when leaderboard data loads
  useEffect(() => {
    if (leaderboard.length > 0) {
      podiumAnims.forEach(a => a.setValue(0));
      Animated.stagger(150, podiumAnims.slice(0, Math.min(3, leaderboard.length)).map(anim =>
        Animated.spring(anim, { toValue: 1, useNativeDriver: false, tension: 40, friction: 8 })
      )).start();
    }
  }, [leaderboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleAddFriend = async () => {
    if (!friendEmail.trim() || !studentId) return;
    setAddingFriend(true);
    try {
      const res = await sendFriendRequest(studentId, friendEmail);
      if (res.success) {
        if (res.createdNewUser) {
          Linking.openURL(`mailto:${friendEmail}?subject=Join me on StudyMate AI&body=I added you as a friend on StudyMate AI. Join me!`);
        }
        Alert.alert(tr('success'), res.message);
        setFriendEmail('');
        await fetchData(true);
      } else {
        Alert.alert(tr('notice'), res.message);
      }
    } catch {
      Alert.alert(tr('error'), tr('request_failed'));
    } finally {
      setAddingFriend(false);
    }
  };

  const handleAcceptRequest = async (fromId: string) => {
    if (!studentId) return;
    try {
      await acceptFriendRequest(studentId, fromId);
      await fetchData(true);
    } catch {
      Alert.alert(tr('error'), tr('accept_failed'));
    }
  };

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading && !refreshing) return <ScreenSkeleton />;

  const maxXp = leaderboard.length > 0 ? Math.max(leaderboard[0]?.xp || 1, 1) : 1;

  const renderPendingOut = () =>
    friends.pendingOut.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('sent_requests')}
        </Text>
        {friends.pendingOut.map(f => (
          <SurfaceCard key={`out-${f.id}`} style={styles.pendingRowContainer}>
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{f.email}</Text>
            </View>
            <View style={[styles.pendingBadge, { backgroundColor: colors.surface3 }]}>
              <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600', marginLeft: 4, fontFamily: Fonts.bodyMedium }}>
                {tr('pending')}
              </Text>
            </View>
          </SurfaceCard>
        ))}
      </View>
    ) : null;

  const renderPendingIn = () =>
    friends.pendingIn.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('pending_requests')}
        </Text>
        {friends.pendingIn.map(f => (
          <SurfaceCard key={`in-${f.id}`} style={styles.pendingRowContainer}>
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{f.email}</Text>
            </View>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleAcceptRequest(f.id)}
            >
              <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700', fontFamily: Fonts.display }}>
                {tr('accept')}
              </Text>
            </TouchableOpacity>
          </SurfaceCard>
        ))}
      </View>
    ) : null;

  // Podium — top 3 users displayed as bars of different heights
  const renderPodium = () => {
    if (leaderboard.length < 1) return null;
    const top3 = leaderboard.slice(0, 3);
    // Display order: 2nd, 1st, 3rd (podium style)
    const podiumOrder = top3.length >= 3
      ? [top3[1], top3[0], top3[2]]
      : top3.length === 2
        ? [top3[1], top3[0]]
        : [top3[0]];
    const podiumHeights = top3.length >= 3
      ? [90, 130, 70]
      : top3.length === 2
        ? [90, 130]
        : [130];
    const podiumRanks = top3.length >= 3
      ? [1, 0, 2]
      : top3.length === 2
        ? [1, 0]
        : [0];

    return (
      <View style={styles.podiumContainer}>
        {podiumOrder.map((user, idx) => {
          const realRank = podiumRanks[idx];
          const isMe = user.id === studentId;
          const initials = user.name
            ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
            : '?';
          const animIdx = Math.min(realRank, podiumAnims.length - 1);
          const barHeight = podiumAnims[animIdx].interpolate({
            inputRange: [0, 1],
            outputRange: [0, podiumHeights[idx]],
          });

          return (
            <View key={user.id} style={styles.podiumSlot}>
              {/* Avatar */}
              <View style={[styles.podiumAvatar, {
                backgroundColor: MEDAL_COLORS[realRank] + '33',
                borderColor: MEDAL_COLORS[realRank],
                borderWidth: isMe ? 2 : 1,
              }]}>
                <Text style={[styles.podiumInitials, { color: MEDAL_COLORS[realRank], fontFamily: Fonts.display }]}>
                  {initials}
                </Text>
              </View>
              <Text style={[styles.podiumName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>
                {isMe ? tr('you') : user.name?.split(' ')[0] || '?'}
              </Text>
              <Text style={[styles.podiumXp, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                {user.xp} XP
              </Text>
              {/* Bar */}
              <Animated.View style={[styles.podiumBar, {
                height: barHeight,
                backgroundColor: MEDAL_COLORS[realRank] + (isDark ? '44' : '28'),
                borderColor: MEDAL_COLORS[realRank] + '55',
              }]}>
                <Text style={[styles.podiumMedal]}>{MEDAL_EMOJI[realRank]}</Text>
              </Animated.View>
              <Text style={[styles.podiumRankLabel, { color: MEDAL_COLORS[realRank], fontFamily: Fonts.display }]}>
                #{realRank + 1}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}>
      {/* Custom Sub-screen Header with Back Navigation */}
      <View style={[styles.headerRow, { borderBottomColor: colors.borderSubtle }]}>
        {!isTab && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
  try {
    router.back();
  } catch {
    router.replace('/');
  }
}}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('competition')}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Flat Gamification Stats Panel */}
        <View style={[styles.statsHeader, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={styles.statItem}>
            <Ionicons name="star-outline" size={18} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.level || 1}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>{tr('level')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.statItem}>
            <Ionicons name="flash-outline" size={18} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.xp || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>XP</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.statItem}>
            <Ionicons name="flame-outline" size={18} color={colors.xpGold} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.streak || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>{tr('streak')}</Text>
          </View>
        </View>

        {/* Tab Buttons */}
        <View style={[styles.tabs, { borderBottomColor: colors.borderSubtle }]}>
          {(['leaderboard', 'friends'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.accent : colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                {tr(tab)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'leaderboard' ? (
          <View style={{ marginTop: 16 }}>
            {renderPendingIn()}
            {renderPendingOut()}

            {leaderboard.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="trophy-outline" size={40} color={colors.textTertiary} />}
                heading="No leaderboard data"
                body="Complete a quiz to make it onto the board!"
              />
            ) : (
              <View style={{ marginBottom: 16 }}>
                {/* Podium for top 3 */}
                {renderPodium()}

                {/* Full ranked list with proportional XP bars */}
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, marginTop: 20, marginBottom: 12 }]}>
                  FULL RANKINGS
                </Text>
                {leaderboard.map((user, index) => {
                  const rank = index + 1;
                  const isMe = user.id === studentId;
                  const xpPct = Math.max((user.xp / maxXp) * 100, 6);
                  const medalColor = rank <= 3 ? MEDAL_COLORS[rank - 1] : undefined;

                  const initials = user.name
                    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                    : '?';

                  return (
                    <View
                      key={user.id}
                      style={[styles.lbWrapper, {
                        borderColor: isMe ? colors.accentBorder : colors.borderSubtle,
                      }]}
                    >
                      <View
                        style={[
                          styles.lbItem,
                          {
                            backgroundColor: isMe ? colors.accentMuted : colors.surface1,
                          }
                        ]}
                      >
                        {/* Rank or medal */}
                        <View style={styles.rankContainer}>
                          {rank <= 3 ? (
                            <Text style={styles.medalEmoji}>{MEDAL_EMOJI[rank - 1]}</Text>
                          ) : (
                            <Text style={[styles.rankText, { color: colors.textTertiary, fontFamily: Fonts.display }]}>
                              {rank}
                            </Text>
                          )}
                        </View>

                        {/* Avatar initials */}
                        <View style={[styles.avatarCircle, {
                          backgroundColor: medalColor ? medalColor + '22' : colors.accent + '22',
                          borderWidth: isMe ? 1.5 : 0,
                          borderColor: isMe ? colors.accent : 'transparent',
                        }]}>
                          <Text style={[styles.avatarInitials, { color: medalColor || colors.accent, fontFamily: Fonts.display }]}>
                            {initials}
                          </Text>
                        </View>

                        {/* Name, level, XP bar */}
                        <View style={styles.lbInfo}>
                          <View style={styles.lbNameRow}>
                            <Text style={[styles.lbName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>
                              {user.name} {isMe ? `(${tr('you')})` : ''}
                            </Text>
                            <Text style={[styles.lbXp, { color: medalColor || colors.accent, fontFamily: Fonts.display }]}>
                              {user.xp} XP
                            </Text>
                          </View>
                          <View style={styles.lbBarRow}>
                            <View style={[styles.lbBarTrack, { backgroundColor: colors.surface3 }]}>
                              <View style={[styles.lbBarFill, {
                                width: `${xpPct}%`,
                                backgroundColor: medalColor || colors.accent,
                                opacity: 0.7,
                              }]} />
                            </View>
                            <View style={[styles.levelBadge, { backgroundColor: colors.surface3 }]}>
                              <Text style={[styles.levelBadgeText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                                Lv.{user.level}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {stats && stats.badges.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{tr('your_badges')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                  {stats.badges.map(b => (
                    <SurfaceCard key={b.id} style={styles.badgeCard}>
                      <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.accent} />
                      <Text style={[styles.badgeName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{b.name}</Text>
                    </SurfaceCard>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            {/* Add Friend Card */}
            <SurfaceCard style={styles.addFriendCard}>
              <Text style={[styles.addFriendTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                {tr('add_friend')}
              </Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={[styles.addInput, {
                    backgroundColor: colors.surface2,
                    color: colors.textPrimary,
                    borderColor: colors.borderSubtle,
                    fontFamily: Fonts.body,
                  }]}
                  placeholder={tr('friend_email')}
                  placeholderTextColor={colors.textTertiary}
                  value={friendEmail}
                  onChangeText={setFriendEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.accent }]}
                  onPress={handleAddFriend}
                  disabled={addingFriend}
                >
                  {addingFriend
                    ? <ActivityIndicator color={colors.textInverse} size="small" />
                    : <Ionicons name="person-add" size={20} color={colors.textInverse} />}
                </TouchableOpacity>
              </View>
            </SurfaceCard>

            {renderPendingIn()}
            {renderPendingOut()}

            {/* Friends list */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{tr('friends')}</Text>
              {friends.accepted.length === 0 ? (
                <EmptyState
                  icon={<Ionicons name="people-outline" size={40} color={colors.textTertiary} />}
                  heading="No friends yet"
                  body="Add friends by email above to see them in your list."
                />
              ) : (
                friends.accepted.map(f => (
                  <SurfaceCard key={f.id} style={styles.friendCard}>
                    <View style={styles.friendInfo}>
                      <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
                      <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                        {tr('level')} {f.level} • {f.xp} {tr('xp')}
                      </Text>
                    </View>
                  </SurfaceCard>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  content: { flex: 1, paddingHorizontal: 20 },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  statItem: { alignItems: 'center', gap: 4 },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  statValue: { fontSize: 20, fontWeight: '600' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 16 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  section: { marginBottom: 24, marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase', marginBottom: 12 },

  // Podium
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 8,
    gap: 16,
  },
  podiumSlot: {
    alignItems: 'center',
    width: 90,
  },
  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  podiumInitials: {
    fontSize: 15,
    fontWeight: '700',
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  podiumXp: {
    fontSize: 11,
    marginBottom: 6,
  },
  podiumBar: {
    width: 56,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    minHeight: 30,
  },
  podiumMedal: {
    fontSize: 22,
  },
  podiumRankLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },

  // Ranked list rows
  lbWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  lbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rankContainer: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 14, fontWeight: '700' },
  medalEmoji: { fontSize: 18 },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitials: { fontSize: 13, fontWeight: '600' },
  lbInfo: { flex: 1 },
  lbNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  lbName: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  lbXp: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  lbBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lbBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  lbBarFill: {
    height: 6,
    borderRadius: 3,
  },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  levelBadgeText: { fontSize: 10, fontWeight: '500' },

  // Badges
  badgeCard: { padding: 16, borderRadius: 14, alignItems: 'center', width: 104, justifyContent: 'center' },
  badgeName: { fontSize: 11, fontWeight: '600', marginTop: 8, textAlign: 'center' },

  // Add friend
  addFriendCard: { padding: 16, marginBottom: 16 },
  addFriendTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase', marginBottom: 12 },
  addInputRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  
  // Pending and list cards
  pendingRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
  },
  friendCard: {
    padding: 16,
    marginBottom: 8,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  friendEmail: { fontSize: 12 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
