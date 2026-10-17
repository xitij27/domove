import type { ImageRequireSource } from 'react-native';
import type { Closure, Site, Status } from '../sites';

// German traffic signs (docs/map-signs.md), 32 dp with a shadow; planned ones are faded and carry a yellow clock.
// Rendered from docs/images/signs by scripts/render-signs.py.
export const SIGNS: Record<Closure, Record<Status, ImageRequireSource>> = {
  full: { current: require('../../assets/signs/full_current.png'), planned: require('../../assets/signs/full_planned.png') },
  one_way: { current: require('../../assets/signs/one_way_current.png'), planned: require('../../assets/signs/one_way_planned.png') },
  cycle_path: { current: require('../../assets/signs/cycle_path_current.png'), planned: require('../../assets/signs/cycle_path_planned.png') },
  sidewalk: { current: require('../../assets/signs/sidewalk_current.png'), planned: require('../../assets/signs/sidewalk_planned.png') },
  signal: { current: require('../../assets/signs/signal_current.png'), planned: require('../../assets/signs/signal_planned.png') },
  half: { current: require('../../assets/signs/half_current.png'), planned: require('../../assets/signs/half_planned.png') },
  narrowing: { current: require('../../assets/signs/narrowing_current.png'), planned: require('../../assets/signs/narrowing_planned.png') },
  other: { current: require('../../assets/signs/other_current.png'), planned: require('../../assets/signs/other_planned.png') },
};

export const CLOSURE_LABELS: Record<Closure, string> = {
  full: 'Full closure',
  one_way: 'One-way rule',
  cycle_path: 'Cycle path closed',
  sidewalk: 'Sidewalk closed',
  signal: 'Temporary traffic lights',
  half: 'Half closure',
  narrowing: 'Road narrowed',
  other: 'Roadworks',
};

// Where signs overlap, the more restrictive one lies on top.
const STACKING: Closure[] = ['other', 'sidewalk', 'narrowing', 'half', 'signal', 'cycle_path', 'one_way', 'full'];

export const signOf = (site: Site) => SIGNS[site.closure][site.status];
export const stackingOf = (site: Site) => STACKING.indexOf(site.closure);

// The Mapbox map looks its images up by name.
const nameOf = (closure: string, status: string) => `sign-${closure}-${status}`;
export const signName = (site: Site) => nameOf(site.closure, site.status);
export const NAMED_SIGNS = Object.fromEntries(
  Object.entries(SIGNS).flatMap(([closure, images]) => Object.entries(images).map(([status, image]) => [nameOf(closure, status), image] as const)),
);
