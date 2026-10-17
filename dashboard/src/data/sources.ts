// Every dataset the dashboard reads, straight from the browser: Supabase for the sites (the same
// table the app reads), the city's open data portal for the rest, OpenHolidays for school holidays.
import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import type { LonLat } from '../model/geo';

const ODS = 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type RawSite = {
  id: string;
  status: 'current' | 'planned';
  title: string;
  owner: string;
  district: string;
  startsOn: string | null;
  endsOn: string | null;
  geometry: Polygon | MultiPolygon | null;
  center: LonLat;
};
export type Poi = { name: string; detail: string; district: string; at: LonLat };
export type District = { name: string; geometry: Polygon | MultiPolygon };
export type Road = { name: string; cls: string; geometry: LineString | MultiLineString };
export const PERIODS = [
  ['2025', '2025'], ['2026_i', '2026 Q1'], ['2026_ii', '2026 Q2'], ['2026_iii', '2026 Q3'],
  ['2026_iv', '2026 Q4'], ['2027', '2027'], ['2028', '2028'],
] as const;
export type PeriodKey = (typeof PERIODS)[number][0];
export type ProgrammeProject = {
  id: string;
  name: string;
  district: string;
  trade: string;
  status: string;
  priorityClass: string;
  points: number;
  mainRoad: boolean;
  transit: boolean;
  stages: Record<PeriodKey, string>;
};
export type Holiday = { start: string; end: string; name: string };

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isPolygonal = (g: unknown): g is Polygon | MultiPolygon =>
  !!g && typeof g === 'object' && ((g as Polygon).type === 'Polygon' || (g as MultiPolygon).type === 'MultiPolygon') &&
  Array.isArray((g as Polygon).coordinates);
const isLinear = (g: unknown): g is LineString | MultiLineString =>
  !!g && typeof g === 'object' && ((g as LineString).type === 'LineString' || (g as MultiLineString).type === 'MultiLineString') &&
  Array.isArray((g as LineString).coordinates);
const lonLat = (v: unknown): LonLat | null => {
  const p = v as { lon?: unknown; lat?: unknown } | null;
  return p && typeof p.lon === 'number' && typeof p.lat === 'number' && Number.isFinite(p.lon) && Number.isFinite(p.lat)
    ? [p.lon, p.lat]
    : null;
};
/** ODS wraps shapes as a GeoJSON Feature. */
const featureGeometry = (v: unknown): unknown => (v && typeof v === 'object' ? (v as { geometry?: unknown }).geometry : undefined);

async function getJson(url: string, label: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`${label}: network error`);
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

async function getRows(dataset: string, label: string, params: Record<string, string> = {}): Promise<Row[]> {
  const body = await getJson(`${ODS}/${dataset}/exports/json?${new URLSearchParams(params)}`, label);
  if (!Array.isArray(body)) throw new Error(`${label}: unexpected response`);
  return body.filter((r): r is Row => !!r && typeof r === 'object');
}

export function parseSites(body: unknown): RawSite[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error('Construction sites: unexpected response');
  return features.flatMap((f) => {
    const p = (f?.properties ?? {}) as Row;
    const center = lonLat({ lon: p.longitude, lat: p.latitude });
    if (typeof p.id !== 'string' || (p.status !== 'current' && p.status !== 'planned') || !center) return [];
    const day = (v: unknown) => (typeof v === 'string' && ISO_DAY.test(v) ? v : null);
    return [{
      id: p.id,
      status: p.status,
      title: str(p.title) || 'Baustelle',
      owner: str(p.owner),
      district: str(p.district),
      startsOn: day(p.starts_on),
      endsOn: day(p.ends_on),
      geometry: isPolygonal(f.geometry) ? f.geometry : null,
      center,
    }];
  });
}

export async function fetchSites(): Promise<RawSite[]> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in dashboard/.env');
  // shortcut: no pagination, Supabase returns at most 1000 rows; fine for ~200 sites (as in mobile/src/sites.ts)
  const body = await getJson(
    `${url}/rest/v1/construction_sites?select=id,status,title,owner,district,starts_on,ends_on,latitude,longitude,geom`,
    'Construction sites',
    // PostgREST then answers with a FeatureCollection whose geometry is the site's polygon
    { headers: { apikey: key, Accept: 'application/geo+json' } },
  );
  return parseSites(body);
}

export const fetchDistricts = async (): Promise<District[]> =>
  (await getRows('fb62-stadtbezirke', 'Districts', { select: 'stadtbezirk_bezeichnung,geografische_polygone' })).flatMap((r) => {
    const geometry = featureGeometry(r.geografische_polygone);
    return str(r.stadtbezirk_bezeichnung) && isPolygonal(geometry) ? [{ name: str(r.stadtbezirk_bezeichnung), geometry }] : [];
  });

/** Lower-cased ASCII key, as the population table names its district columns ("horde", "innenstadt_west"). */
export const districtKey = (name: string): string =>
  name.toLowerCase().replaceAll('ä', 'a').replaceAll('ö', 'o').replaceAll('ü', 'u').replaceAll('ß', 'ss').replace(/[^a-z]+/g, '_');

export async function fetchResidents(): Promise<{ year: string; byKey: Record<string, number> }> {
  const [row] = await getRows('bevolkerungsstand-stadtbezirke', 'Residents', { order_by: 'jahr desc', limit: '1' });
  if (!row) throw new Error('Residents: no data');
  const byKey: Record<string, number> = {};
  for (const [key, value] of Object.entries(row)) if (typeof value === 'number' && value > 0) byKey[key] = value;
  return { year: str(row.jahr), byKey };
}

async function fetchPois(dataset: string, label: string, keep: (r: Row) => boolean = () => true): Promise<Poi[]> {
  const rows = await getRows(dataset, label, { select: 'objektname,objektzusa,objektart,i_zusinfo,stadtbezbe,geo_point_2d' });
  return rows.filter(keep).flatMap((r) => {
    const at = lonLat(r.geo_point_2d);
    return at && str(r.objektname) ? [{ name: str(r.objektname), detail: str(r.i_zusinfo), district: str(r.stadtbezbe), at }] : [];
  });
}

export const fetchStops = () => fetchPois('haltestellen', 'Stadtbahn stops');
export const fetchBikeStations = () => fetchPois('fahrradmietstation', 'Bike-share stations');
export const fetchParkRide = () => fetchPois('park-and-ride', 'Park and ride');
// The professional fire and rescue stations; the volunteer Löschzüge aren't staffed around the clock.
export const fetchFireStations = () =>
  fetchPois('feuerwehr', 'Fire and rescue stations', (r) => str(r.objektname).startsWith('Feuer- und Rettungswache'));
export const fetchHospitals = () => fetchPois('krankenhaus', 'Hospitals', (r) => str(r.objektart) === 'KrankenhausKlinik');

export const ROAD_CLASSES = ['Hauptverkehrstraße', 'Verbindungsstrasse zu BAB,B,L,K', 'Verkehrsstraße'];

export const fetchRoads = async (): Promise<Road[]> =>
  (await getRows('fb62-strassenabschnitte', 'Main roads', {
    select: 'strassenname,strassenklasse,geo_shape',
    where: `strassenklasse in (${ROAD_CLASSES.map((c) => JSON.stringify(c)).join(',')})`,
  })).flatMap((r) => {
    const geometry = featureGeometry(r.geo_shape);
    return isLinear(geometry) ? [{ name: str(r.strassenname), cls: str(r.strassenklasse), geometry }] : [];
  });

export function parseProgramme(rows: Row[]): ProgrammeProject[] {
  return rows.flatMap((r) => {
    const name = str(r.bezeichnung);
    if (!name) return [];
    const district = str(r.stadtbezirk);
    const stages = Object.fromEntries(PERIODS.map(([key]) => [key, str(r[key])])) as Record<PeriodKey, string>;
    return [{
      id: str(r.projektnummer) || name,
      name,
      district: district.toLowerCase() === 'überörtlich' ? 'Citywide' : district,
      trade: str(r.gewerk),
      status: str(r.massnahmenstatus),
      priorityClass: str(r.prioritatenklasse),
      points: typeof r.summe_gewichtungspunkte === 'number' ? r.summe_gewichtungspunkte : 0,
      mainRoad: !!r.bewertungstatbestand_verkehrliche_bedeutung_hauptstrassen_gewichtung_1_punkt,
      transit: !!r.bewertungstatbestand_opnv_barrierefreiheit_gewichtung_3_punkte,
      stages,
    }];
  });
}

export const fetchProgramme = async (): Promise<ProgrammeProject[]> =>
  parseProgramme(await getRows('baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht', 'Works programme'));

export async function fetchHolidays(from: string, to: string): Promise<Holiday[]> {
  const params = new URLSearchParams({ countryIsoCode: 'DE', subdivisionCode: 'DE-NW', languageIsoCode: 'EN', validFrom: from, validTo: to });
  const body = await getJson(`https://openholidaysapi.org/SchoolHolidays?${params}`, 'School holidays');
  if (!Array.isArray(body)) throw new Error('School holidays: unexpected response');
  return body.flatMap((h: Row) => {
    const start = str(h.startDate);
    const end = str(h.endDate);
    const names = Array.isArray(h.name) ? (h.name as Row[]) : [];
    const name = str(names.find((n) => n.language === 'EN')?.text) || str(names[0]?.text) || 'School holidays';
    return ISO_DAY.test(start) && ISO_DAY.test(end) ? [{ start, end, name }] : [];
  });
}
