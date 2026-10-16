import { type ConstructionObstacleEvent, type NotificationPreference, type NotificationRoute, isRoute } from './model';

export type ScheduleDecision = { date: Date | null; reason?: string };

function localDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 9, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Reminders use 09:00 device-local time. Late announcements are skipped. */
export function scheduleDecision(event: ConstructionObstacleEvent, preference: NotificationPreference, now = new Date()): ScheduleDecision {
  if (preference === 'DISABLED') return { date: null, reason: 'Notifications disabled.' };
  const start = localDate(event.constructionStartDate);
  if (!start) return { date: null, reason: 'Construction start date is missing or invalid.' };
  if (event.constructionEndDate !== undefined) {
    const end = localDate(event.constructionEndDate);
    if (!end) return { date: null, reason: 'Construction end date is invalid.' };
    if (end.getTime() < start.getTime()) return { date: null, reason: 'Construction ends before it starts.' };
    if (end.getTime() < now.getTime()) return { date: null, reason: 'Construction has ended.' };
  }
  const reminder = new Date(start);
  reminder.setDate(reminder.getDate() - (preference === 'ONE_WEEK_BEFORE' ? 7 : 1));
  if (reminder.getTime() <= now.getTime()) return { date: null, reason: 'The chosen reminder time has passed.' };
  return { date: reminder };
}

export function notificationContent(route: NotificationRoute, event: ConstructionObstacleEvent) {
  const location = event.constructionLocation.trim();
  const destination = route.destination.label.trim();
  const date = localDate(event.constructionStartDate);
  const body = event.additionalMinutes
    ? `There is a construction site at ${location} on your route to ${destination}. Take a detour of ${event.additionalMinutes} minutes. Tap here to see it.`
    : `Construction work at ${location} may affect your route to ${destination} starting on ${date?.toLocaleDateString() ?? 'an upcoming date'}. Tap here to check your route.`;
  return { title: 'Upcoming Construction Alert!', body };
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

export function occurrenceSignature(route: NotificationRoute, event: ConstructionObstacleEvent, preference: NotificationPreference, date: Date): string {
  return JSON.stringify([route, event, preference, date.getTime()]);
}
