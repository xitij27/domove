// Builds public/population.json: Dortmund's residents per 100 m square from the 2022 census (Zensus 2022, Statistisches
// Bundesamt), for the scores that ask how many people live near a work. Rerun when a new census grid is published:
// `npm run population`. Source to cite: © Statistisches Bundesamt (Destatis), Zensus 2022.
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import { booleanPointInPolygon } from '@turf/turf';

const OUT = new URL('../public/population.json', import.meta.url);
const ZIP = 'https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip';
const DISTRICTS = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/fb62-stadtbezirke/exports/geojson';
const UA = { 'User-Agent': 'domove-dashboard (+https://github.com/xitij27/domove)' };

// --- EPSG:3035 (ETRS89 LAEA Europe) to longitude/latitude, ellipsoidal (Snyder 1987) ---
const A = 6378137, F = 1 / 298.257222101, E2 = 2 * F - F * F, E = Math.sqrt(E2);
const LAT0 = (52 * Math.PI) / 180, LON0 = (10 * Math.PI) / 180, FE = 4321000, FN = 3210000;
const q = (phi) => {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
};
const QP = q(Math.PI / 2), B1 = Math.asin(q(LAT0) / QP), RQ = A * Math.sqrt(QP / 2);
const D = (A * (Math.cos(LAT0) / Math.sqrt(1 - E2 * Math.sin(LAT0) ** 2))) / (RQ * Math.cos(B1));
function toLonLat(X, Y) {
  const x = X - FE, y = Y - FN, rho = Math.hypot(x / D, D * y);
  if (rho === 0) return [10, 52];
  const c = 2 * Math.asin(rho / (2 * RQ));
  const beta = Math.asin(Math.cos(c) * Math.sin(B1) + (D * y * Math.sin(c) * Math.cos(B1)) / rho);
  const lon = LON0 + Math.atan2(x * Math.sin(c), D * rho * Math.cos(B1) * Math.cos(c) - D * D * y * Math.sin(B1) * Math.sin(c));
  const lat = beta + (E2 / 3 + (31 * E2 ** 2) / 180 + (517 * E2 ** 3) / 5040) * Math.sin(2 * beta)
    + ((23 * E2 ** 2) / 360 + (251 * E2 ** 3) / 3780) * Math.sin(4 * beta) + ((761 * E2 ** 3) / 45360) * Math.sin(6 * beta);
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}
// self-check: the projection's origin, and Dortmund's centre (worked out with an independent forward projection)
const close = (a, b, d) => Math.abs(a[0] - b[0]) < d && Math.abs(a[1] - b[1]) < d;
if (!close(toLonLat(FE, FN), [10, 52], 1e-9) || !close(toLonLat(4145082.4, 3158935.6), [7.4653, 51.5136], 1e-5)) {
  throw new Error('EPSG:3035 conversion is off');
}

/** The one entry of a zip whose name matches, as a stream: read from the central directory, inflated with zlib. */
function zipEntry(buf, match) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  let at = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    const nameLen = buf.readUInt16LE(at + 28), name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    if (match.test(name)) {
      if (buf.readUInt16LE(at + 10) !== 8) throw new Error(`${name}: not deflated`);
      const size = buf.readUInt32LE(at + 20), local = buf.readUInt32LE(at + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      return Readable.from([buf.subarray(start, start + size)]).pipe(createInflateRaw());
    }
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  throw new Error(`no entry matching ${match}`);
}

const get = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};
const districts = (await (await get(DISTRICTS)).json()).features;
const zip = Buffer.from(await (await get(ZIP)).arrayBuffer());

const cells = [];
let header = null;
for await (const line of createInterface({ input: zipEntry(zip, /100m-Gitter\.csv$/) })) {
  const parts = line.split(';');
  if (!header) {
    header = parts;
    continue;
  }
  const n = Number(parts[header.indexOf('Einwohner')]); // suppressed cells read as NaN and drop out
  if (!(n > 0)) continue;
  const x = Number(parts[header.indexOf('x_mp_100m')]), y = Number(parts[header.indexOf('y_mp_100m')]);
  // cheap box test first: only cells near Dortmund are converted and tested against its districts
  if (x < 4129000 || x > 4161000 || y < 3144000 || y > 3173000) continue;
  const at = toLonLat(x, y);
  if (districts.some((d) => booleanPointInPolygon(at, d))) cells.push([Math.round(at[0] * 1e5) / 1e5, Math.round(at[1] * 1e5) / 1e5, n]);
}
const total = cells.reduce((sum, c) => sum + c[2], 0);
if (total < 500_000 || total > 700_000) throw new Error(`${total} residents in Dortmund looks wrong; keeping the old file`);

await writeFile(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: ZIP,
  attribution: '© Statistisches Bundesamt (Destatis), Zensus 2022',
  cells,
}));
console.log(`${cells.length} squares, ${total} residents → ${OUT.pathname}`);
