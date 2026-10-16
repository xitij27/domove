import { DEFAULT_SETTINGS, type ConstructionObstacleEvent, type NotificationPreference, type NotificationRoute, type RouteNotificationSettings, isRoute } from './model';

export type ScheduleDecision = { date: Date | null; reason?: string };

export function localDate(value: string | undefined, time = '09:00'): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function settingsFrom(input: RouteNotificationSettings | NotificationPreference): RouteNotificationSettings {
  return typeof input === 'string' ? { ...DEFAULT_SETTINGS, preference: input } : input;
}

/** Uses device-local calendar days and wall-clock time, including across DST changes. */
export function scheduleDecision(event: ConstructionObstacleEvent, input: RouteNotificationSettings | NotificationPreference, now = new Date()): ScheduleDecision {
  const settings = settingsFrom(input);
  if (settings.preference === 'DISABLED') return { date: null, reason: 'Notifications disabled.' };
  if (event.change === 'CANCELLED') return { date: null, reason: 'Construction was cancelled.' };
  if (settings.commuteDays?.length && event.activeWeekdays?.length
    && !settings.commuteDays.some((day) => event.activeWeekdays?.includes(day))) {
    return { date: null, reason: 'Construction does not overlap configured commuting days.' };
  }
  const start = localDate(event.constructionStartDate, settings.notificationTime);
  if (!start) return { date: null, reason: 'Construction start date is missing or invalid.' };
  if (event.constructionEndDate !== undefined) {
    const end = localDate(event.constructionEndDate, '23:59');
    if (!end) return { date: null, reason: 'Construction end date is invalid.' };
    if (end.getTime() < start.getTime()) return { date: null, reason: 'Construction ends before it starts.' };
    if (end.getTime() < now.getTime()) return { date: null, reason: 'Construction has ended.' };
  }
  const reminder = new Date(start);
  reminder.setDate(reminder.getDate() - (settings.preference === 'ONE_WEEK_BEFORE' ? 7 : 1));
  if (reminder.getTime() <= now.getTime()) return { date: null, reason: 'The chosen reminder time has passed.' };
  return { date: reminder };
}

/** Only a recent, explicit new/significant revision may produce an opt-in urgent alert. */
export function lastMinuteDecision(event: ConstructionObstacleEvent, settings: RouteNotificationSettings, now = new Date()): boolean {
  if (!settings.importantUpdates || settings.preference === 'DISABLED'
    || (event.change !== 'NEW' && event.change !== 'SIGNIFICANT_CHANGE')
    || !event.revision || !event.observedAt) return false;
  if (scheduleDecision(event, settings, now).reason !== 'The chosen reminder time has passed.') return false;
  const published = Date.parse(event.observedAt);
  if (!Number.isFinite(published) || published > now.getTime() || now.getTime() - published > 24 * 60 * 60 * 1000) return false;
  const start = localDate(event.constructionStartDate, '00:00');
  if (!start) return false;
  const end = event.constructionEndDate ? localDate(event.constructionEndDate, '23:59') : null;
  if (event.constructionEndDate && (!end || end.getTime() < now.getTime())) return false;
  if (!end && start.toDateString() !== now.toDateString() && start.getTime() < now.getTime()) return false;
  return true;
}

export function notificationContent(route: NotificationRoute, event: ConstructionObstacleEvent) {
  const location = event.constructionLocation.trim();
  const destination = route.destination.label.trim();
  const date = localDate(event.constructionStartDate);
  const start = date ? ` from ${date.toLocaleDateString()}` : '';
  const estimate = event.additionalMinutes ? ` Estimated additional travel time: ${event.additionalMinutes} minutes.` : '';
  return {
    title: 'Upcoming Construction Alert',
    body: `Construction work at ${location} may affect your commute to ${destination}${start}.${estimate} Tap to check your route.`,
  };
}

export function googleMapsDirectionsUrl(route: NotificationRoute, event?: ConstructionObstacleEvent): string | null {
  if (!isRoute(route)) return null;
  const waypoints = event?.alternativeWaypoints ?? route.waypoints?.map((stop) => stop.label) ?? [];
  const cleanWaypoints = waypoints.map((stop) => stop.trim()).filter(Boolean).slice(0, 3);
  const mode = { pedestrian: 'walking', bike: 'bicycling', car: 'driving' }[route.mode];
  const query = [
    'api=1',
    `origin=${encodeURIComponent(route.start.label.trim())}`,
    `destination=${encodeURIComponent(route.destination.label.trim())}`,
    `travelmode=${mode}`,
  ];
  if (cleanWaypoints.length) query.push(`waypoints=${encodeURIComponent(cleanWaypoints.join('|'))}`);
  return `https://www.google.com/maps/dir/?${query.join('&')}`;
}

export function occurrenceKey(routeId: string, obstacleId: string): string {
  return JSON.stringify([routeId, obstacleId]);
}

export function occurrenceSignature(route: NotificationRoute, event: ConstructionObstacleEvent, settings: RouteNotificationSettings | NotificationPreference, date: Date): string {
  const selected = settingsFrom(settings);
  return JSON.stringify([route, event, selected.preference, selected.notificationTime, selected.commuteDays ?? [], date.getTime()]);
}
