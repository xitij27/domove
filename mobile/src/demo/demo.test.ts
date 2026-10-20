import type { RouteObstacle } from '../notifications/model';
import type { SavedRoute } from '../routes/model';
import type { Site } from '../sites';
import { ALERT_STEP, pickDemo, STEPS } from './demo';

const route = (id: string) => ({ id, name: id }) as SavedRoute;
const site = (id: string) => ({ id, status: 'current' }) as Site;
const obstacle = (routeId: string, siteId: string): RouteObstacle => ({
  routeId, siteId, siteTitle: siteId, destination: null, startsOn: null, endsOn: null,
});

describe('pickDemo', () => {
  it('picks the route with the most loaded sites, and its first one', () => {
    const demo = pickDemo(
      [obstacle('a', 's1'), obstacle('b', 'gone'), obstacle('b', 's2'), obstacle('b', 's3'), obstacle('c', 'gone'), obstacle('c', 'gone2'), obstacle('c', 'gone3')],
      [route('a'), route('b'), route('c')],
      [site('s1'), site('s2'), site('s3')],
    );
    expect(demo?.route.id).toBe('b');
    expect(demo?.obstacle.siteId).toBe('s2');
    expect(demo?.site.id).toBe('s2');
  });

  it('skips obstacles of routes that are no longer saved', () => {
    expect(pickDemo([obstacle('deleted', 's1')], [route('a')], [site('s1')])).toBeNull();
  });

  it('is null when no route has construction the map knows', () => {
    expect(pickDemo([obstacle('a', 'gone')], [route('a')], [site('s1')])).toBeNull();
    expect(pickDemo([], [route('a')], [site('s1')])).toBeNull();
  });
});

it('never opens a site or navigates on a step where the route first appears, going either way', () => {
  // A newly shown route clears the site card and stops navigation.
  STEPS.forEach((step, i) => {
    const appears = step.scene.route && (!STEPS[i - 1]?.scene.route || !STEPS[i + 1]?.scene.route);
    if (appears) expect(step.scene.site || step.scene.navigate).toBeFalsy();
    // a way is one of the shown route's
    if (step.scene.way) expect(step.scene.route).toBe(true);
  });
  expect(ALERT_STEP).toBeGreaterThan(0);
});
