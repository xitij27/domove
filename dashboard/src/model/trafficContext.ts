import type { Poi } from '../data/sources';
import { pointShapeDist, toXY } from './geo';
import type { PotentialConflict, ProjectEvidence } from './outlook';
import { validLonLat } from './outlook';
import { ROAD_LABEL } from './sites';
import type { Site } from './sites';

export type TrafficContext = {
  road: string | null;
  stopsKnown: boolean;
  stops: { name: string; detail: string; m: number }[];
  nearby: { id: string; metres: number; from: number; to: number }[];
  sources: string[];
  limitations: string[];
};

/** Context only: proximity is neither a closure nor evidence that a transit line is disrupted. */
export function trafficContext(
  site: Site,
  evidence: ProjectEvidence,
  stops: Poi[] | null,
  roadsAvailable: boolean,
  conflicts: PotentialConflict[],
  radius = 500,
): TrafficContext {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Context radius must be non-negative.');
  const limitations = [
    'Proximity does not prove a traffic or public transport disruption.',
    'Alternative route analysis unavailable: no verified closure-aware network analysis is connected.',
    'Road classifications are not measured traffic volumes or delay estimates.',
  ];
  const sources = ['Reported construction footprints and dates · do.move / Stadt Dortmund'];
  const matchedRoad = roadsAvailable && evidence.shape !== null && site.roadName.trim() !== '';
  const road = matchedRoad ? `${site.roadName} · ${ROAD_LABEL[site.road]}` : null;
  if (roadsAvailable) {
    sources.push('Stadt Dortmund · fb62-strassenabschnitte');
    limitations.push('The road feed includes selected main and through roads only; no match does not establish a local-road classification.');
  } else limitations.push('Road network data unavailable.');
  if (!road) limitations.push('No verified road classification for this construction footprint.');
  if (stops !== null) sources.push('Stadt Dortmund · haltestellen (rail / Stadtbahn; not a complete bus-stop inventory)');
  else limitations.push('Public transport stop data unavailable.');
  if (!evidence.shape) limitations.push('Verified construction footprint unavailable; proximity distances are not calculated from a synthetic marker.');
  const validStops = stops?.filter((stop) => stop.name.trim() !== '' && validLonLat(stop.at));
  const stopsKnown = !!evidence.shape && stops !== null && validStops?.length === stops.length;
  if (validStops && stops && validStops.length !== stops.length) limitations.push('Some stops have invalid coordinates or names; nearby-stop counts are incomplete.');

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
