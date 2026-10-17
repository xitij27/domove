import type { RouteNotificationSettings, RouteObstacle } from '../notifications/model';
import type { SavedRoute } from '../routes/model';
import type { Site } from '../sites';

/** What a step puts on the screen; anything left out is closed, so Back works as well as Next. */
export type Scene = {
  route?: boolean;
  site?: boolean;
  navigate?: boolean;
  forecast?: boolean;
  quiz?: boolean;
  /** Which way along the route to show, once the ways around construction are found; the recommended one (0) if left out. */
  way?: number;
  /** Run on entering the step: turn the route's alerts on, or send its alert in a few seconds. */
  action?: 'alerts' | 'send';
};

export type DemoStep = { title: string; text: string; scene: Scene };

/** Seconds until the demo's alert arrives: time to lock the phone. */
export const ALERT_DELAY = 10;

export const STEPS: DemoStep[] = [
  {
    title: 'Construction sites',
    text: 'Every construction site in the city, from its open data. The chips count current and planned work; tap one to hide those sites.',
    scene: {},
  },
  {
    title: 'A site',
    // not the scores sheet itself: it covers the whole screen, this card included
    text: 'Tapping a pin shows the site: what is closed, until when, and its impact score for each way of travel. "How scores work" explains the score.',
    scene: { site: true },
  },
  {
    title: 'Your saved route',
    text: 'A saved route shows only the construction on its way, and how much of it has high impact.',
    scene: { route: true },
  },
  {
    title: 'Ways around construction',
    text: 'The app plans the best way around that construction: the card says how long it takes and what it avoids. Up to two other ways are drawn in grey.',
    scene: { route: true },
  },
  {
    title: 'Another way',
    text: 'Tapping a grey line, or its button on the card, picks that way instead. Start then follows it.',
    scene: { route: true, way: 1 },
  },
  {
    title: 'Alerts',
    text: 'Alerts for this route are now on, 1 day before work starts. The route and the site card show when the alert comes.',
    scene: { route: true, site: true, action: 'alerts' },
  },
  {
    title: 'The alert',
    text: `Lock the phone now. In ${ALERT_DELAY} seconds the alert for this site arrives; tap it.`,
    scene: { route: true, site: true, action: 'send' },
  },
  {
    title: 'Opened from the alert',
    text: 'Tapping the alert opened its construction site on the map.',
    scene: { route: true, site: true },
  },
  {
    title: 'Navigation',
    text: 'Start follows you along the route, turning the map the way you go.',
    scene: { route: true, navigate: true },
  },
  {
    title: 'Weather',
    text: 'The forecast for the coming hours, for planning the trip.',
    scene: { route: true, forecast: true },
  },
  {
    title: 'Quiz',
    text: 'A quick quiz about the city, while you wait.',
    scene: { route: true, quiz: true },
  },
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
