import { sendNotification } from './notifications';
import { requestJson } from './api';

export type ReminderSource = 'user' | 'ai';

export interface CalendarReminder {
  id: string;
  title: string;
  note: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  notifyMinutesBefore: number;
  completed: boolean;
  source: ReminderSource;
  createdAt: string;
}

const REMINDERS_STORAGE_KEY = 'erp_calendar_reminders_v1';
const REMINDER_DISPATCH_STORAGE_KEY = 'erp_calendar_reminder_dispatch_v1';
const REMINDERS_CHANGED_EVENT = 'REMINDERS_UPDATED';

const DEFAULT_NOTIFY_MINUTES = 30;

type ReminderApiItem = {
  id: string;
  title: string;
  note: string;
  date: string;
  time: string;
  notifyMinutesBefore: number;
  completed: boolean;
  source: ReminderSource;
  createdAt: string;
  updatedAt?: string;
};

function normalizeDate(value: string) {
  const safe = String(value || '').trim();
  if (!safe) return '';

  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(safe)) return safe;

  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return '';

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeTime(value: string) {
  const safe = String(value || '').trim();
  if (!safe) return '09:00';

  const match = safe.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return '09:00';

  const rawHours = Number(match[1]);
  const rawMinutes = Number(match[2] || '0');

  if (!Number.isFinite(rawHours) || !Number.isFinite(rawMinutes)) return '09:00';

  const hours = Math.min(23, Math.max(0, rawHours));
  const minutes = Math.min(59, Math.max(0, rawMinutes));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeNotifyMinutes(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NOTIFY_MINUTES;
  return Math.min(24 * 60, Math.max(0, Math.round(numeric)));
}

function toReminderDate(reminder: CalendarReminder) {
  const date = normalizeDate(reminder.date);
  const time = normalizeTime(reminder.time);
  return new Date(`${date}T${time}:00`);
}

function emitRemindersChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export function getRemindersChangedEventName() {
  return REMINDERS_CHANGED_EVENT;
}

export function loadReminders(): CalendarReminder[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as CalendarReminder[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item): CalendarReminder => ({
        id: String(item.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`)),
        title: String(item.title || '').trim(),
        note: String(item.note || '').trim(),
        date: normalizeDate(item.date),
        time: normalizeTime(item.time),
        notifyMinutesBefore: normalizeNotifyMinutes(item.notifyMinutesBefore),
        completed: Boolean(item.completed),
        source: item.source === 'ai' ? 'ai' : 'user',
        createdAt: String(item.createdAt || new Date().toISOString()),
      }))
      .filter((item) => item.title && item.date);
  } catch {
    return [];
  }
}

export function saveReminders(reminders: CalendarReminder[]) {
  if (typeof window === 'undefined') return;

  const normalized = reminders
    .map((item) => ({
      ...item,
      title: String(item.title || '').trim(),
      note: String(item.note || '').trim(),
      date: normalizeDate(item.date),
      time: normalizeTime(item.time),
      notifyMinutesBefore: normalizeNotifyMinutes(item.notifyMinutesBefore),
    }))
    .filter((item) => item.title && item.date)
    .sort((a, b) => toReminderDate(a).getTime() - toReminderDate(b).getTime());

  window.localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(normalized));
  emitRemindersChanged();
}

export function createReminder(input: {
  title: string;
  date: string;
  time?: string;
  note?: string;
  notifyMinutesBefore?: number;
  source?: ReminderSource;
}) {
  const reminders = loadReminders();
  const reminder: CalendarReminder = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`,
    title: String(input.title || '').trim(),
    note: String(input.note || '').trim(),
    date: normalizeDate(input.date),
    time: normalizeTime(input.time || '09:00'),
    notifyMinutesBefore: normalizeNotifyMinutes(input.notifyMinutesBefore ?? DEFAULT_NOTIFY_MINUTES),
    completed: false,
    source: input.source === 'ai' ? 'ai' : 'user',
    createdAt: new Date().toISOString(),
  };

  if (!reminder.title || !reminder.date) {
    throw new Error('Reminder requires title and date');
  }

  saveReminders([...reminders, reminder]);
  void createReminderRemote(reminder)
    .then((remoteReminder) => {
      if (!remoteReminder) return;
      const latest = loadReminders();
      const updated = latest.map((item) => (item.id === reminder.id ? remoteReminder : item));
      saveReminders(updated);
    })
    .catch(() => {
      // Keep local copy when remote sync fails.
    });

  return reminder;
}

export function updateReminder(id: string, patch: Partial<CalendarReminder>) {
  const reminders = loadReminders();
  const updated = reminders.map((item) => (item.id === id ? { ...item, ...patch } : item));
  saveReminders(updated);
  const candidate = updated.find((item) => item.id === id);
  if (candidate) {
    void updateReminderRemote(id, candidate).catch(() => {
      // Keep local copy when remote sync fails.
    });
  }
}

export function toggleReminderCompleted(id: string) {
  const reminders = loadReminders();
  const updated = reminders.map((item) => (
    item.id === id
      ? { ...item, completed: !item.completed }
      : item
  ));
  saveReminders(updated);
}

export function deleteReminder(id: string) {
  const reminders = loadReminders();
  saveReminders(reminders.filter((item) => item.id !== id));
  void deleteReminderRemote(id).catch(() => {
    // Keep local copy removed even if remote delete fails.
  });
}

function mapApiReminder(item: ReminderApiItem): CalendarReminder {
  return {
    id: String(item.id),
    title: String(item.title || '').trim(),
    note: String(item.note || '').trim(),
    date: normalizeDate(item.date),
    time: normalizeTime(item.time),
    notifyMinutesBefore: normalizeNotifyMinutes(item.notifyMinutesBefore),
    completed: Boolean(item.completed),
    source: item.source === 'ai' ? 'ai' : 'user',
    createdAt: String(item.createdAt || new Date().toISOString()),
  };
}

async function createReminderRemote(reminder: CalendarReminder) {
  const response = await requestJson<ReminderApiItem>('/api/reminders', {
    method: 'POST',
    body: JSON.stringify({
      title: reminder.title,
      note: reminder.note,
      date: reminder.date,
      time: reminder.time,
      notifyMinutesBefore: reminder.notifyMinutesBefore,
      completed: reminder.completed,
      source: reminder.source,
    }),
  });

  if (!response || !response.id) return null;
  return mapApiReminder(response);
}

async function updateReminderRemote(id: string, reminder: CalendarReminder) {
  await requestJson<ReminderApiItem>(`/api/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: reminder.title,
      note: reminder.note,
      date: reminder.date,
      time: reminder.time,
      notifyMinutesBefore: reminder.notifyMinutesBefore,
      completed: reminder.completed,
      source: reminder.source,
    }),
  });
}

async function deleteReminderRemote(id: string) {
  await requestJson<void>(`/api/reminders/${id}`, {
    method: 'DELETE',
  });
}

export async function syncRemindersFromServer() {
  try {
    const response = await requestJson<{ items: ReminderApiItem[] }>('/api/reminders');
    const remoteItems = (response?.items || []).map(mapApiReminder);
    const localItems = loadReminders();

    const byId = new Map<string, CalendarReminder>();
    localItems.forEach((item) => byId.set(item.id, item));
    remoteItems.forEach((item) => byId.set(item.id, item));

    saveReminders(Array.from(byId.values()));
  } catch {
    // Keep local reminders when backend sync fails.
  }
}

function loadDispatchMap() {
  if (typeof window === 'undefined') return new Map<string, number>();

  try {
    const raw = window.localStorage.getItem(REMINDER_DISPATCH_STORAGE_KEY);
    if (!raw) return new Map<string, number>();
    const entries = JSON.parse(raw) as unknown;
    const normalizedEntries: Array<[string, number]> = (Array.isArray(entries) ? entries : [])
      .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length === 2)
      .map((entry) => [String(entry[0]), Number(entry[1])] as [string, number])
      .filter((entry) => Number.isFinite(entry[1]));
    return new Map<string, number>(normalizedEntries);
  } catch {
    return new Map<string, number>();
  }
}

function saveDispatchMap(map: Map<string, number>) {
  if (typeof window === 'undefined') return;
  const serialized = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500);
  window.localStorage.setItem(REMINDER_DISPATCH_STORAGE_KEY, JSON.stringify(serialized));
}

async function showBrowserReminder(reminder: CalendarReminder) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const title = `Recordatorio: ${reminder.title}`;
  const body = reminder.note || `Programado para ${reminder.date} ${reminder.time}`;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag: `reminder_${reminder.id}`,
          requireInteraction: false,
          data: { reminderId: reminder.id },
        });
        return;
      }
    }

    new Notification(title, {
      body,
      tag: `reminder_${reminder.id}`,
    });
  } catch {
    // Ignore browser notification failures and rely on app notifications.
  }
}

export async function requestReminderNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function dispatchDueReminderNotifications(now = new Date()) {
  const reminders = loadReminders();
  const dispatchMap = loadDispatchMap();
  let dispatched = 0;

  for (const reminder of reminders) {
    if (reminder.completed) continue;

    const triggerAt = new Date(toReminderDate(reminder).getTime() - (reminder.notifyMinutesBefore * 60 * 1000));
    const timeUntilTrigger = triggerAt.getTime() - now.getTime();

    // Trigger from planned minute up to 10 minutes later (in case app was inactive).
    if (timeUntilTrigger > 0 || timeUntilTrigger < -10 * 60 * 1000) continue;

    const dispatchKey = `${reminder.id}_${triggerAt.toISOString().slice(0, 16)}`;
    if (dispatchMap.has(dispatchKey)) continue;

    const body = reminder.note || `Tienes una actividad programada para ${reminder.date} ${reminder.time}.`;

    await sendNotification('Recordatorio de actividad', `${reminder.title}. ${body}`, 'system');
    await showBrowserReminder(reminder);

    dispatchMap.set(dispatchKey, now.getTime());
    dispatched += 1;
  }

  if (dispatched > 0) {
    saveDispatchMap(dispatchMap);
  }

  return dispatched;
}
