// Builds Dortmund's public transport from OpenStreetMap: public/transit-lines.json (the Stadtbahn lines in DSW21's
// colours, S-Bahn and regional trains, and local buses as one feature per street with the lines that use it) and
// public/transit-stops.json (every bus, tram and train stop, for the walking distances the scores use). Rerun after a
// timetable change (usually December): `npm run transit-network`. Data © OpenStreetMap contributors, ODbL: both files
// are derived databases, so they stay under the ODbL and need the attribution the dashboard shows.
import { writeFile } from 'node:fs/promises';
import { bboxClip, simplify } from '@turf/turf';

const OUT = new URL('../public/transit-lines.json', import.meta.url);
const STOPS_OUT = new URL('../public/transit-stops.json', import.meta.url);
const QUERY = `[out:json][timeout:180];
area["name"="Dortmund"]["boundary"="administrative"]["admin_level"="6"]->.a;
relation["type"="route"]["route"~"^(tram|bus|train)$"](area.a);
out geom;`;
// Dortmund with about 2 km to spare, so lines leave the map edge rather than stop at the city limit
const BOX = [7.27, 51.40, 7.67, 51.62];
const LOCAL_TRAINS = new Set(['regional', 'commuter']);

const round = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
// "RE 1 (RRX)" → "RE1", "S 2" → "S2": short enough to label along a line
const shortRef = (ref) => ref.replace(/\s*\(.*\)/, '').replace(/\s+/g, '');

/** The way members that carry the route (not platforms or stop positions), each clipped and simplified. */
function pieces(rel) {
  return rel.members.flatMap((m) => {
    if (m.type !== 'way' || /platform|stop/.test(m.role) || !m.geometry?.length) return [];
    const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: m.geometry.map((g) => [g.lon, g.lat]) } };
    const clipped = bboxClip(line, BOX).geometry;
    const parts = clipped.type === 'LineString' ? [clipped.coordinates] : clipped.coordinates;
    return parts.filter((p) => p.length > 1).map((coordinates) => ({
      id: `${m.ref}:${coordinates[0]}`,
      coordinates: simplify({ type: 'LineString', coordinates }, { tolerance: 0.00002 }).coordinates.map(round),
    }));
  });
}

async function overpass(query) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'domove-dashboard (+https://github.com/xitij27/domove)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
  return (await res.json()).elements;
}
const elements = await overpass(QUERY);

const lines = new Map(); // `${kind}:${ref}` → one feature per Stadtbahn or train line, both directions merged
const streets = new Map(); // way piece → the bus lines that use it
for (const rel of elements) {
  const tags = rel.tags ?? {};
  const ref = shortRef(tags.ref ?? '');
  if (!ref) continue;
  if (tags.route === 'bus') {
    if (/flix/i.test(`${tags.operator} ${tags.network} ${tags.name}`)) continue; // long-distance coaches
    for (const p of pieces(rel)) {
      const street = streets.get(p.id) ?? { coordinates: p.coordinates, refs: new Set() };
      street.refs.add(ref);
      streets.set(p.id, street);
    }
    continue;
  }
  const kind = tags.route === 'tram' ? 'stadtbahn' : 'train';
  if (kind === 'train' && !LOCAL_TRAINS.has(tags.service)) continue; // ICE, IC and the like only pass through
  const key = `${kind}:${ref}`;
  const line = lines.get(key) ?? { kind, ref, colour: '', from: tags.from ?? '', to: tags.to ?? '', pieces: new Map() };
  if (!line.colour && /^#[0-9a-f]{6}$/i.test(tags.colour ?? '')) line.colour = tags.colour.toLowerCase();
  for (const p of pieces(rel)) line.pieces.set(p.id, p.coordinates);
  lines.set(key, line);
}

const byRef = (a, b) => a.localeCompare(b, 'de', { numeric: true });
const features = [
  ...[...streets.values()].map((s) => ({
    type: 'Feature',
    properties: { kind: 'bus', refs: [...s.refs].sort(byRef).join(' · '), n: s.refs.size },
    geometry: { type: 'LineString', coordinates: s.coordinates },
  })),
  ...[...lines.values()].filter((l) => l.pieces.size).sort((a, b) => byRef(a.ref, b.ref)).map((l) => ({
    type: 'Feature',
    properties: { kind: l.kind, ref: l.ref, colour: l.colour, from: l.from, to: l.to },
    geometry: { type: 'MultiLineString', coordinates: [...l.pieces.values()] },
  })),
];
const count = (kind) => features.filter((f) => f.properties.kind === kind).length;
if (count('stadtbahn') < 5 || count('bus') < 100) throw new Error('Overpass returned too few lines; keeping the old file');

await writeFile(OUT, JSON.stringify({
  type: 'FeatureCollection',
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors, ODbL',
  features,
}));
console.log(`${count('stadtbahn')} Stadtbahn lines, ${count('train')} train lines, ${count('bus')} bus street pieces → ${OUT.pathname}`);

// Every stop in the same box as the lines, so a work near the city limit still finds the stop across it.
const stopElements = await overpass(`[out:json][timeout:120];
(
  node["highway"="bus_stop"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
  node["public_transport"="platform"]["bus"="yes"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
  node["railway"="tram_stop"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
  node["public_transport"="stop_position"]["tram"="yes"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
  nwr["railway"~"^(station|halt)$"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
  nwr["public_transport"="station"]["train"="yes"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});
);
out tags center;`);
/** Stadtbahn stations are often tagged as railway stations of the light-rail or subway kind; they count as tram stops. */
function stopKind(t) {
  if (t.railway === 'tram_stop' || (t.public_transport === 'stop_position' && t.tram === 'yes') || ['light_rail', 'subway', 'tram'].includes(t.station)) return 'tram';
  if (t.railway === 'station' || t.railway === 'halt' || (t.public_transport === 'station' && t.train === 'yes')) return 'rail';
  return 'bus';
}
const stops = stopElements.flatMap((e) => {
  const lon = e.lon ?? e.center?.lon;
  const lat = e.lat ?? e.center?.lat;
  return typeof lon === 'number' && typeof lat === 'number' ? [[...round([lon, lat]), stopKind(e.tags ?? {}), e.tags?.name ?? '']] : [];
});
const stopCount = (kind) => stops.filter((s) => s[2] === kind).length;
if (stopCount('bus') < 1000 || stopCount('tram') < 100 || stopCount('rail') < 20) throw new Error('Overpass returned too few stops; keeping the old file');
await writeFile(STOPS_OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors, ODbL',
  stops,
}));
console.log(`${stopCount('bus')} bus, ${stopCount('tram')} tram and ${stopCount('rail')} train stops → ${STOPS_OUT.pathname}`);
