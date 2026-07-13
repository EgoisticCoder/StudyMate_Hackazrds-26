// Notification service — local notifications for study reminders, quiz abandonment, etc.

import { Platform } from 'react-native';

// We use dynamic import for expo-notifications to avoid Expo Go push token errors
// Exported so callers (e.g. app/_layout.tsx's listener setup) reuse this already-loaded,
// already-suppressed instance instead of calling require('expo-notifications') again —
// a second raw require was re-triggering the module's Expo Go push-token console.error.
export interface ExpoNotificationsModule {
  setNotificationHandler: (handler: any) => void;
  setNotificationChannelAsync: (channelId: string, channel: any) => Promise<any>;
  getPermissionsAsync: () => Promise<any>;
  requestPermissionsAsync: () => Promise<any>;
  cancelAllScheduledNotificationsAsync: () => Promise<any>;
  setBadgeCountAsync: (count: number) => Promise<any>;
  scheduleNotificationAsync: (request: any) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<any>;
  getAllScheduledNotificationsAsync: () => Promise<any[]>;
  addNotificationReceivedListener: (callback: (notification: any) => void) => any;
  addNotificationResponseReceivedListener: (callback: (response: any) => void) => any;
  AndroidImportance: {
    HIGH: number;
    DEFAULT: number;
    LOW: number;
  };
  SchedulableTriggerInputTypes: {
    DAILY: string;
    DATE: string;
    WEEKLY: string;
  };
}

export let Notifications: ExpoNotificationsModule | null = null;

const notif = () => Notifications!;

if (Platform.OS !== 'web') {
  try {
    // expo-notifications has a top-level side effect (DevicePushTokenAutoRegistration.fx.js)
    // that unconditionally logs via console.error on Android when running inside Expo Go,
    // because remote push was removed from Expo Go in SDK 53+. It's non-fatal — local
    // notifications (what this app actually uses) still work — but it triggers a jarring
    // red-box on every launch. Swallow just that one known message during the require().
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      if (msg.includes('Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go')) {
        return;
      }
      originalConsoleError(...args);
    };
    try {
      Notifications = require('expo-notifications');
    } finally {
      console.error = originalConsoleError;
    }

    // Configure notification handling
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // On Android 8+ (API 26+), every notification MUST belong to a channel,
    // and if that channel doesn't exist yet (or has importance below
    // DEFAULT), the OS silently drops the notification — scheduleNotificationAsync
    // still resolves successfully, so nothing in this codebase would ever
    // surface an error. This was the actual reason notifications "weren't
    // working" on Android: no channel was ever created. iOS is unaffected
    // (channels are an Android-only concept), which is why it's easy to miss
    // in testing.
    if (Platform.OS === 'android') {
      Notifications!.setNotificationChannelAsync('default', {
        name: 'StudyMate Reminders',
        importance: Notifications!.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C5CE7',
        sound: 'default',
      }).catch((err: any) => console.warn('Failed to create notification channel:', err));
    }
  } catch (err) {
    console.warn('Failed to initialize expo-notifications:', err);
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return false;
  try {
    const { status: existingStatus } = await notif().getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notif().requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

// ── Notification Types ───────────────────────

export type NotificationType =
  | 'study_reminder'
  | 'quiz_abandoned'
  | 'inactivity_nudge'
  | 'streak_at_risk'
  | 'mood_checkin'
  | 'exam_approaching'
  | 'daily_goal_incomplete'
  | 'weekly_report'
  | 'calendar_event'
  | 'timetable_nudge'
  | 'focus_session_complete'
  | 'focus_distraction';

interface NotificationConfig {
  title: string;
  body: string;
  data?: Record<string, any>;
}

const NOTIFICATION_TEMPLATES: Record<NotificationType, (params?: any) => NotificationConfig> = {
  study_reminder: (params) => ({
    title: '📚 Time to study!',
    body: params?.subject
      ? `Your ${params.peakTime || 'optimal'} study window is here. Start with ${params.subject} today.`
      : 'Your optimal study time is now. Open StudyMate to begin.',
    data: { type: 'study_reminder', screen: '/(tabs)' },
  }),

  quiz_abandoned: (params) => ({
    title: '⏸️ Quiz left incomplete',
    body: `You left a ${params?.subject || ''} quiz midway. Come back and finish it — your progress is saved.`,
    data: { type: 'quiz_abandoned', screen: '/(tabs)/quiz' },
  }),

  inactivity_nudge: (params) => ({
    title: '👋 We miss you',
    body: params?.days
      ? `It's been ${params.days} days since your last session. Even 15 minutes of ${params.weakSubject || 'study'} helps.`
      : 'Open StudyMate for a quick study session. Consistency beats intensity.',
    data: { type: 'inactivity_nudge', screen: '/(tabs)' },
  }),

  streak_at_risk: (params) => ({
    title: '🔥 Streak at risk!',
    body: `Your ${params?.streak || 0}-day streak will break if you don't study today. Don't let it end.`,
    data: { type: 'streak_at_risk', screen: '/(tabs)' },
  }),

  mood_checkin: () => ({
    title: '🧠 How are you feeling?',
    body: 'Log your mood to help calibrate your AI tutor. It takes 5 seconds.',
    data: { type: 'mood_checkin', screen: '/(tabs)' },
  }),

  exam_approaching: (params) => ({
    title: `📅 Exam in ${params?.daysLeft || '?'} days`,
    body: `${params?.examName || 'Your exam'} is coming up. Focus on weak chapters now.`,
    data: { type: 'exam_approaching', screen: '/(tabs)/learn' },
  }),

  daily_goal_incomplete: (params) => ({
    title: '🎯 Daily goal incomplete',
    body: `You've studied ${params?.minutesDone || 0} of your ${params?.targetMinutes || 60} minute target. ${params?.minutesLeft || 60} minutes left.`,
    data: { type: 'daily_goal_incomplete', screen: '/screens/FocusTimerScreen' },
  }),

  weekly_report: (params) => ({
    title: '📊 Your weekly report is ready',
    body: `${params?.quizzes || 0} quizzes, ${params?.studyHours || 0}h studied. Tap to see your full progress.`,
    data: { type: 'weekly_report', screen: '/(tabs)/progress' },
  }),

  calendar_event: (params) => ({
    title: `📌 ${params?.eventTitle || 'Event'}`,
    body: params?.eventDescription || 'Your scheduled event is coming up.',
    data: { type: 'calendar_event', eventId: params?.eventId },
  }),

  timetable_nudge: (params) => ({
    title: '📋 Weekly timetable',
    body:
      params?.incomplete != null && params.incomplete > 0
        ? `You have ${params.incomplete} task${params.incomplete === 1 ? '' : 's'} left this week. Tap to check them off.`
        : 'Review your study timetable for this week in StudyMate.',
    data: { type: 'timetable_nudge', screen: '/(tabs)' },
  }),

  focus_session_complete: (params) => ({
    title: '⏱️ Session Complete!',
    body: params?.subject
      ? `Great job! You studied ${params.subject} for ${params.mins || '?'} minutes. Keep the momentum going!`
      : 'Focus session complete. Well done!',
    data: { type: 'focus_session_complete', screen: '/(tabs)/progress' },
  }),

  focus_distraction: () => ({
    title: '👀 Stay focused!',
    body: 'Looks like you got distracted. Get back to studying — you\'ve got this!',
    data: { type: 'focus_distraction', screen: '/screens/FocusTimerScreen' },
  }),
};

// ── Immediate Notifications ──────────────────

/**
 * Send an immediate local notification
 */
export async function sendNotification(
  type: NotificationType,
  params?: Record<string, any>
): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    const config = NOTIFICATION_TEMPLATES[type](params);
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: null, // immediate
    });
    return id;
  } catch (err) {
    console.error('Notification send failed:', err);
    return null;
  }
}

// ── Scheduled Notifications ──────────────────

/**
 * Schedule a daily study reminder
 */
export async function scheduleDailyStudyReminder(
  hour: number,
  minute: number,
  params?: { subject?: string; peakTime?: string }
): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    // Cancel existing study reminders
    await cancelNotificationsByType('study_reminder');

    const config = NOTIFICATION_TEMPLATES.study_reminder(params);
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: {
        type: notif().SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return id;
  } catch (err) {
    console.error('Schedule study reminder failed:', err);
    return null;
  }
}

/**
 * Schedule a mood check-in reminder (daily at 9 AM)
 */
export async function scheduleMoodReminder(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    await cancelNotificationsByType('mood_checkin');

    const config = NOTIFICATION_TEMPLATES.mood_checkin();
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: {
        type: notif().SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });
    return id;
  } catch (err) {
    console.error('Schedule mood reminder failed:', err);
    return null;
  }
}

/**
 * Schedule a streak-at-risk reminder (evening, 8 PM)
 */
export async function scheduleStreakReminder(streak: number): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    await cancelNotificationsByType('streak_at_risk');

    const config = NOTIFICATION_TEMPLATES.streak_at_risk({ streak });
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: {
        type: notif().SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
    return id;
  } catch (err) {
    console.error('Schedule streak reminder failed:', err);
    return null;
  }
}

/**
 * Schedule exam approaching notification
 */
export async function scheduleExamReminder(
  examName: string,
  examDate: Date,
  daysBeforeArr: number[] = [7, 3, 1]
): Promise<string[]> {
  if (Platform.OS === 'web' || !Notifications) return [];
  const ids: string[] = [];

  for (const daysBefore of daysBeforeArr) {
    const triggerDate = new Date(examDate);
    triggerDate.setDate(triggerDate.getDate() - daysBefore);
    triggerDate.setHours(8, 0, 0, 0);

    if (triggerDate > new Date()) {
      try {
        const config = NOTIFICATION_TEMPLATES.exam_approaching({
          examName,
          daysLeft: daysBefore,
        });
        const id = await notif().scheduleNotificationAsync({
          content: {
            title: config.title,
            body: config.body,
            data: config.data || {},
            sound: true,
            channelId: Platform.OS === 'android' ? 'default' : undefined,
          },
          trigger: { type: notif().SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });
        ids.push(id);
      } catch (err) {
        console.warn('Failed to schedule notification:', err);
      }
    }
  }
  return ids;
}

/**
 * Schedule a calendar event notification
 */
export async function scheduleCalendarEventNotification(
  eventTitle: string,
  eventDescription: string,
  eventDate: Date,
  eventId: string,
  minutesBefore: number = 15
): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    const triggerDate = new Date(eventDate);
    triggerDate.setMinutes(triggerDate.getMinutes() - minutesBefore);

    if (triggerDate <= new Date()) return null;

    const config = NOTIFICATION_TEMPLATES.calendar_event({
      eventTitle,
      eventDescription,
      eventId,
    });
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: { type: notif().SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
    return id;
  } catch (err) {
    console.error('Schedule calendar notification failed:', err);
    return null;
  }
}

// ── Cancellation ─────────────────────────────

/**
 * Cancel all scheduled notifications of a specific type
 */
export async function cancelNotificationsByType(type: NotificationType): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    const scheduled = await notif().getAllScheduledNotificationsAsync();
    for (const notifItem of scheduled) {
      if (notifItem.content.data?.type === type) {
        await notif().cancelScheduledNotificationAsync(notifItem.identifier);
      }
    }
  } catch (err) {
    console.warn('Cancel notifications by type failed:', err);
  }
}

/**
 * Cancel all notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await notif().cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('Cancel all notifications failed:', err);
  }

}

/**
 * Get badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await notif().setBadgeCountAsync(count);
  } catch (err) {
    console.warn('setBadgeCount failed:', err);
  }
}

// ── Setup Defaults ───────────────────────────

/**
 * Set up all default scheduled notifications for a student
 */
/**
 * Daily reminder to open the dashboard timetable (peak study hour).
 */
export async function scheduleTimetableNudge(
  hour: number,
  minute: number,
  incompleteHint?: number
): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    await cancelNotificationsByType('timetable_nudge');

    const config = NOTIFICATION_TEMPLATES.timetable_nudge({
      incomplete: incompleteHint ?? 0,
    });
    const id = await notif().scheduleNotificationAsync({
      content: {
        title: config.title,
        body: config.body,
        data: config.data || {},
        sound: true,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
      trigger: {
        type: notif().SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return id;
  } catch (err) {
    console.error('Schedule timetable nudge failed:', err);
    return null;
  }
}

export async function setupDefaultNotifications(params: {
  peakStudyTime: string;
  streak: number;
  weakSubject?: string;
}): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  // Parse peak time to hour
  const peakHourMap: Record<string, number> = {
    'Early Morning': 6,
    Morning: 9,
    Afternoon: 14,
    Evening: 18,
    'Late Night': 21,
    Night: 21,
  };
  const studyHour = peakHourMap[params.peakStudyTime] || 18;

  // Schedule daily study reminder at their peak time
  await scheduleDailyStudyReminder(studyHour, 0, {
    subject: params.weakSubject,
    peakTime: params.peakStudyTime,
  });

  // Schedule morning mood check-in
  await scheduleMoodReminder();

  // Schedule streak reminder if they have a streak
  if (params.streak > 0) {
    await scheduleStreakReminder(params.streak);
  }
}
