// What a site closes, read from its title, and what that means per mode. Mirrors issue #12.
// shortcut: the classifier lives in the dashboard until #12's closures/closure_impacts columns exist; then read them from the database.

export type ClosureKind =
  | 'full' | 'carriageway' | 'half' | 'narrowing' | 'signal'
  | 'one_way' | 'sidewalk' | 'moving' | 'parking' | 'unknown';
export type Mode = 'car' | 'bike' | 'walk';
export type Impact = { effect: 'none' | 'slowed' | 'blocked'; penaltyS: number };

const none: Impact = { effect: 'none', penaltyS: 0 };
const blocked: Impact = { effect: 'blocked', penaltyS: 0 };
const slowed = (penaltyS: number): Impact => ({ effect: 'slowed', penaltyS });

// Issue #12's defaults with the decisions in docs/route-planning-open-questions.md:
// a one-way rule blocks cars and bikes in both directions, an unnamed restriction has no effect.
export const IMPACTS: Record<ClosureKind, Record<Mode, Impact>> = {
  full: { car: blocked, bike: blocked, walk: slowed(60) },
  carriageway: { car: slowed(120), bike: slowed(60), walk: none },
  half: { car: slowed(120), bike: slowed(60), walk: none },
  narrowing: { car: slowed(60), bike: slowed(30), walk: none },
  signal: { car: slowed(60), bike: slowed(60), walk: slowed(30) },
  one_way: { car: blocked, bike: blocked, walk: none },
  sidewalk: { car: none, bike: none, walk: blocked },
  moving: { car: slowed(60), bike: slowed(30), walk: none },
  parking: { car: none, bike: none, walk: none },
  unknown: { car: none, bike: none, walk: none },
};

/** How much a kind disrupts getting around, for the planner's load and scores; a full closure is 1. */
export const KIND_WEIGHT: Record<ClosureKind, number> = {
  full: 1, carriageway: 0.7, one_way: 0.6, half: 0.5, narrowing: 0.3,
  signal: 0.3, moving: 0.25, sidewalk: 0.2, unknown: 0.1, parking: 0.05,
};

export const KIND_LABEL: Record<ClosureKind, string> = {
  full: 'Full closure', carriageway: 'Carriageway closed', half: 'Half closure', narrowing: 'Lane narrowing',
  signal: 'Temporary lights', one_way: 'One-way rule', sidewalk: 'Sidewalk closed', moving: 'Moving works',
  parking: 'Parking lane closed', unknown: 'No restriction named',
};

// Matched on the lower-cased title with ß written as ss. A site keeps every kind its title names.
const PATTERNS: [ClosureKind, RegExp][] = [
  ['sidewalk', /geh\w*sp|sp\.?\s*-?\s*gehweg|sperrung\s+(?:des\s+|der\s+)?(?:fuss|geh)weg/],
  ['carriageway', /richtungsfahrbahn/],
  ['full', /vollsperrung|\bvsp\b|voll\s*gesperrt/],
  ['half', /halbseit|halbs\.?\s*sp|halb\.\s*sp|wechselseitig/],
  ['narrowing', /einengung|spureinzug|verengung|fahrstreifenreduz/],
  ['signal', /\blsa\b|ampel/],
  ['one_way', /einbahn/],
  ['moving', /wanderbaustelle/],
  ['parking', /parkstreifen/],
];
// "Vollsperrung Fußweg" closes the sidewalk and "Vollsperrung der Richtungsfahrbahn" one carriageway, not the street.
const NOT_FULL = /vollsperrung\s+(?:des\s+|der\s+)?(?:(?:fuss|geh)weg\w*|richtungsfahrbahn)/g;
// A path as the place ("Emscherradweg zw. …", "Fußgängerbrücke …") means a Vollsperrung closes that path, not a street.
const PATH_PLACE = /radweg|radeweg|fussgängerbrücke|fussweg|gehweg/;
const DAYTIME = /tagsüber|tagsueber|\(\s*\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*uhr/;

const normalize = (title: string) => title.toLowerCase().replaceAll('ß', 'ss');

export function classifyClosures(title: string): ClosureKind[] {
  const text = normalize(title);
  const kinds = new Set(PATTERNS.filter(([kind, re]) => re.test(kind === 'full' ? text.replace(NOT_FULL, ' ') : text)).map(([kind]) => kind));
  if (kinds.has('full') && PATH_PLACE.test(text.split(' - ')[0])) {
    kinds.delete('full');
    kinds.add('sidewalk');
  }
  return kinds.size ? PATTERNS.map(([kind]) => kind).filter((kind) => kinds.has(kind)) : ['unknown'];
}

export const isDaytimeOnly = (title: string): boolean => DAYTIME.test(normalize(title));

export const worstKind = (kinds: ClosureKind[]): ClosureKind =>
  kinds.reduce((worst, kind) => (KIND_WEIGHT[kind] > KIND_WEIGHT[worst] ? kind : worst), kinds[0] ?? 'unknown');

/** The worst effect for the mode; slowed sites take the highest penalty of their kinds, as #12 decided. */
export function impactFor(kinds: ClosureKind[], mode: Mode): Impact {
  const impacts = kinds.map((kind) => IMPACTS[kind][mode]);
  if (impacts.some((i) => i.effect === 'blocked')) return blocked;
  if (!impacts.some((i) => i.effect === 'slowed')) return none;
  return slowed(Math.max(...impacts.map((i) => i.penaltyS)));
}
