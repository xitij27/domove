// The planner's changes: shifted dates, hypothetical projects and the settings changed from their defaults. They live in
// the URL hash only, so a reload keeps them and a link shares them, with the numbers they were worked out by.
import { strings } from '../i18n';
import type { Strings } from '../i18n';
import { IMPACTS } from './closures';
import type { ClosureKind } from './closures';
import { isoDay, toDay } from './days';
import { circle, pointInShape, toLonLat, toXY } from './geo';
import type { LonLat, Shape } from './geo';
import { validSettings } from './settings';
import type { Settings } from './settings';
import type { Site, SiteInput } from './sites';

export type HypotheticalSite = { id: string; name: string; kind: ClosureKind; center: LonLat; radius: number; start: number; days: number };
/** Days added to a site's published start and end. */
export type Shift = [number, number];
export type Scenario = { shifts: Record<string, Shift>; added: HypotheticalSite[]; settings: Partial<Settings> };
export const EMPTY_SCENARIO: Scenario = { shifts: {}, added: [], settings: {} };

export const isEmpty = (s: Scenario): boolean => !Object.keys(s.shifts).length && !s.added.length && !Object.keys(s.settings).length;

/** Each proposed project counts once, moved or not; shifts of published sites count one each. */
export const changeCount = (s: Scenario): number =>
  s.added.length + Object.keys(s.shifts).filter((id) => !s.added.some((h) => h.id === id)).length;

export const applyShifts = (sites: Site[], shifts: Record<string, Shift>): Site[] =>
  sites.map((s) => {
    const shift = shifts[s.id];
    if (!shift) return s;
    const start = s.baseStart + shift[0];
    return { ...s, start, end: Math.max(start, s.baseEnd + shift[1]) };
  });

export function hypotheticalInput(h: HypotheticalSite, districts: { name: string; shape: Shape }[]): SiteInput {
  const center = toXY(h.center);
  return {
    id: h.id,
    status: 'planned',
    title: h.name,
    owner: 'Proposed',
    district: districts.find((d) => pointInShape(center, d.shape))?.name ?? '',
    startsOn: isoDay(h.start),
    endsOn: isoDay(h.start + h.days - 1),
    geometry: { type: 'Polygon', coordinates: [circle(center, h.radius).map(toLonLat)] },
    center: h.center,
    kinds: [h.kind],
    hypothetical: true,
  };
}

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)));

export const encodeScenario = (s: Scenario): string => toBase64Url(JSON.stringify({ v: 1, shifts: s.shifts, added: s.added, settings: s.settings }));

const ID = /^[\w-]{1,64}$/;
const MIN_DAY = toDay('2020-01-01');
const MAX_DAY = toDay('2035-12-31');
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && v >= min && v <= max;

/** Whatever a shared link carries is untrusted: anything malformed is dropped, never thrown. */
export function decodeScenario(text: string): Scenario {
  let raw: { shifts?: unknown; added?: unknown; settings?: unknown };
  try {
    raw = JSON.parse(fromBase64Url(text));
  } catch {
    return EMPTY_SCENARIO;
  }
  if (!raw || typeof raw !== 'object') return EMPTY_SCENARIO;
  const shifts: Record<string, Shift> = {};
  if (raw.shifts && typeof raw.shifts === 'object') {
    for (const [id, v] of Object.entries(raw.shifts)) {
      if (ID.test(id) && Array.isArray(v) && v.length === 2 && isInt(v[0], -3650, 3650) && isInt(v[1], -3650, 3650)) shifts[id] = [v[0], v[1]];
    }
  }
  const added = (Array.isArray(raw.added) ? raw.added : []).slice(0, 50).flatMap((h: Partial<HypotheticalSite>) => {
    const ok = h && typeof h === 'object' && typeof h.id === 'string' && ID.test(h.id) &&
      typeof h.name === 'string' && h.name.length <= 120 && typeof h.kind === 'string' && Object.hasOwn(IMPACTS, h.kind) &&
      Array.isArray(h.center) && isNum(h.center[0], 7.2, 7.8) && isNum(h.center[1], 51.3, 51.7) &&
      isNum(h.radius, 10, 500) && isInt(h.start, MIN_DAY, MAX_DAY) && isInt(h.days, 1, 1095);
    return ok ? [{ id: h.id!, name: h.name!.trim() || strings().csv.proposedProject, kind: h.kind!, center: [h.center![0], h.center![1]] as LonLat, radius: h.radius!, start: h.start!, days: h.days! }] : [];
  });
  return { shifts, added, settings: validSettings(raw.settings) };
}

// Text from the city's feed goes into spreadsheets: a leading = + - @ would run as a formula.
const textCell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Semicolon-separated with a BOM, as German Excel expects. */
export function scenarioCsv(scenario: Scenario, sites: Site[], t: Strings = strings()): string {
  const byId = new Map(sites.map((s) => [s.id, s]));
  const rows: (string | number)[][] = [];
  for (const [id, shift] of Object.entries(scenario.shifts)) {
    const s = byId.get(id);
    if (!s || s.hypothetical) continue; // a proposed project's own row below already has its moved dates
    const moved = shift[0] !== 0;
    rows.push([s.title, s.owner, s.district, t.kinds[s.kind], t.roads[s.road], isoDay(s.baseStart), isoDay(s.baseEnd), isoDay(s.start), isoDay(s.end),
      moved ? shift[0] : shift[1], moved ? t.csv.move : shift[1] < 0 ? t.csv.finishEarlier : t.csv.finishLater]);
  }
  for (const h of scenario.added) {
    const s = byId.get(h.id);
    if (!s) continue;
    rows.push([s.title, t.csv.proposed, s.district, t.kinds[s.kind], t.roads[s.road], '', '', isoDay(s.start), isoDay(s.end), '', t.csv.newProject]);
  }
  const header = t.csv.header;
  return '﻿' + [header, ...rows].map((r) => r.map((v) => (typeof v === 'number' ? String(v) : textCell(v))).join(';')).join('\r\n') + '\r\n';
}
