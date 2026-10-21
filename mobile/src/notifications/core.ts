import { locale, strings } from '../i18n';
import type { RouteNotificationSettings, RouteObstacle } from './model';

export function localDate(value: string | null, time: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** The first time today or later when the clock shows `time`. */
function nextAt(time: string, now: Date): Date {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

/**
 * When to remind about an obstacle, in device-local calendar days and wall-clock time.
 * A site without a start date counts as already under way.
 */
export function reminderDate(obstacle: RouteObstacle, settings: RouteNotificationSettings, now = new Date()): Date | null {
  if (settings.preference === 'DISABLED') return null;
  const end = localDate(obstacle.endsOn, '23:59');
  if (end && end.getTime() <= now.getTime()) return null;
  let date = localDate(obstacle.startsOn, settings.notificationTime);
  date?.setDate(date.getDate() - (settings.preference === 'ONE_WEEK_BEFORE' ? 7 : 1));
  // Too late for the chosen lead time, or already under way: remind at the next notification time instead of never.
  if (!date || date.getTime() <= now.getTime()) date = nextAt(settings.notificationTime, now);
  return end && date.getTime() > end.getTime() ? null : date;
}

/**
 * Wording for an alert that hands the route to Google Maps when tapped, in the app's language. `detourMinutes` is how
 * much longer the way around the construction takes; it is mentioned only when above 0.
 */
export function notificationContent(obstacle: RouteObstacle, now = new Date(), detourMinutes = 0) {
  const t = strings().alerts;
  const start = localDate(obstacle.startsOn, '00:00');
  const what = start && start.getTime() > now.getTime()
    ? t.bodyFuture(obstacle.siteTitle, obstacle.destination, start.toLocaleDateString(locale()))
    : t.bodyNow(obstacle.siteTitle, obstacle.destination);
  return {
    title: t.title,
    body: [what, ...(detourMinutes > 0 ? [t.detour(detourMinutes)] : []), t.tap].join(' '),
  };
}

export function obstacleKey(obstacle: Pick<RouteObstacle, 'routeId' | 'siteId'>): string {
  return JSON.stringify([obstacle.routeId, obstacle.siteId]);
}
