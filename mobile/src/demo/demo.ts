import type { RouteNotificationSettings, RouteObstacle } from '../notifications/model';
import type { SavedRoute } from '../routes/model';
import type { Site } from '../sites';

/** What a step puts on the screen; anything left out is closed, so Back works as well as Next. */
export type Scene = {
  route?: boolean;
  site?: boolean;
  forecast?: boolean;
  quiz?: boolean;
  /** Which way along the route to show, once the ways around construction are found; the recommended one (0) if left out. */
  way?: number;
  /** Run on entering the step: turn the route's alerts on, or send its alert in a few seconds. */
  action?: 'alerts' | 'send';
};

export type DemoStepId = 'sites' | 'site' | 'route' | 'ways' | 'another' | 'alerts' | 'alert' | 'opened' | 'google' | 'weather' | 'quiz';
/** A step's title and text are in the i18n strings, under its id. */
export type DemoStep = { id: DemoStepId; scene: Scene };

/** Seconds until the demo's alert arrives: time to lock the phone. */
export const ALERT_DELAY = 10;

export const STEPS: DemoStep[] = [
  { id: 'sites', scene: {} },
  // not the scores sheet itself: it covers the whole screen, this card included
  { id: 'site', scene: { site: true } },
  { id: 'route', scene: { route: true } },
  { id: 'ways', scene: { route: true } },
  { id: 'another', scene: { route: true, way: 1 } },
  { id: 'alerts', scene: { route: true, site: true, action: 'alerts' } },
  { id: 'alert', scene: { route: true, site: true, action: 'send' } },
  { id: 'opened', scene: { route: true, site: true } },
  { id: 'google', scene: { route: true } },
  { id: 'weather', scene: { route: true, forecast: true } },
  { id: 'quiz', scene: { route: true, quiz: true } },
];

export const ALERT_STEP = STEPS.findIndex((step) => step.scene.action === 'send');

export type Demo = { route: SavedRoute; obstacle: RouteObstacle; site: Site };
/** A running demo: where it is, and the route's alert choice to put back after. */
export type DemoRun = Demo & { step: number; before: RouteNotificationSettings };

/** The saved route with the most construction on it that the map has loaded, and its first such site. */
export function pickDemo(obstacles: RouteObstacle[], routes: SavedRoute[], sites: Site[]): Demo | null {
  const loaded = new Map(sites.map((site) => [site.id, site]));
  let best: Demo | null = null;
  let most = 0;
  for (const route of routes) {
    const on = obstacles.filter((obstacle) => obstacle.routeId === route.id && loaded.has(obstacle.siteId));
    if (on.length > most) {
      most = on.length;
      best = { route, obstacle: on[0], site: loaded.get(on[0].siteId)! };
    }
  }
  return best;
}
