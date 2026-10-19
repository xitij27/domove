// Builds public/transit-lines.json from OpenStreetMap: Dortmund's Stadtbahn lines in DSW21's colours, S-Bahn and
// regional trains, and local buses as one feature per street with the lines that use it. Rerun after a timetable
// change (usually December): `npm run transit-lines`. Data © OpenStreetMap contributors, ODbL: the file is a
// derived database, so it stays under the ODbL and needs the attribution the dashboard shows.
import { writeFile } from 'node:fs/promises';
import { bboxClip, simplify } from '@turf/turf';

const OUT = new URL('../public/transit-lines.json', import.meta.url);
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

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'domove-dashboard (+https://github.com/xitij27/domove)', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ data: QUERY }),
});
if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
const { elements } = await res.json();

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
