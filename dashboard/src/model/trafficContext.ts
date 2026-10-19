import type { Poi } from '../data/sources';
import { strings } from '../i18n';
import type { Strings } from '../i18n';
import { pointShapeDist, toXY } from './geo';
import type { PotentialConflict, ProjectEvidence } from './outlook';
import { validLonLat } from './outlook';
import type { Site } from './sites';

export type TrafficContext = {
  road: string | null;
  stopsKnown: boolean;
  stops: { name: string; detail: string; m: number }[];
  nearby: { id: string; metres: number; from: number; to: number }[];
  sources: string[];
  limitations: string[];
};

/** Context only: proximity is neither a closure nor evidence that a transit line is disrupted. Worded in `t`'s language. */
export function trafficContext(
  site: Site,
  evidence: ProjectEvidence,
  stops: Poi[] | null,
  roadsAvailable: boolean,
  conflicts: PotentialConflict[],
  radius = 500,
  t: Strings = strings(),
): TrafficContext {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Context radius must be non-negative.');
  const said = t.traffic;
  const limitations = [said.noProof, said.noAlternative, said.notVolumes];
  const sources = [said.sourceSites];
  const matchedRoad = roadsAvailable && evidence.shape !== null && site.roadName.trim() !== '';
  const road = matchedRoad ? `${site.roadName} · ${t.roads[site.road]}` : null;
  if (roadsAvailable) {
    sources.push(said.sourceRoads);
    limitations.push(said.roadsPartial);
  } else limitations.push(said.noRoads);
  if (!road) limitations.push(said.noRoadClass);
  if (stops !== null) sources.push(said.sourceStops);
  else limitations.push(said.noStops);
  if (!evidence.shape) limitations.push(said.noFootprint);
  const validStops = stops?.filter((stop) => stop.name.trim() !== '' && validLonLat(stop.at));
  const stopsKnown = !!evidence.shape && stops !== null && validStops?.length === stops.length;
  if (validStops && stops && validStops.length !== stops.length) limitations.push(said.badStops);

  const nearbyStops = !evidence.shape || stops === null ? [] : stops
    .filter((stop) => stop.name.trim() !== '' && validLonLat(stop.at))
    .map((stop) => ({ name: stop.name, detail: stop.detail, m: pointShapeDist(toXY(stop.at), evidence.shape!) }))
    .filter((stop) => stop.m <= radius)
    .sort((a, b) => a.m - b.m || a.name.localeCompare(b.name));

  // Reuse the Outlook pairs, including their reported overlap dates and geometry evidence.
  // The caller chooses whether these are all reported periods or a clipped Outlook window.
  const nearby = conflicts.filter((pair) => pair.a === site.id || pair.b === site.id)
    .map((pair) => ({ id: pair.a === site.id ? pair.b : pair.a, metres: pair.metres, from: pair.from, to: pair.to }))
    .sort((a, b) => a.metres - b.metres || a.id.localeCompare(b.id));
  return { road, stopsKnown, stops: nearbyStops, nearby, sources, limitations };
}
