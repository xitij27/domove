// English for the German the city's feed is written in. Only English needs it: German shows the feed's own words.
import type { WorkKind } from '../model/siteName';

export const WORK_EN: Record<WorkKind, string> = {
  emergency: 'Emergency repair',
  ordnance: 'Wartime bomb check',
  burst: 'Burst water main',
  sinkhole: 'Ground collapse',
  mining: 'Old-mine survey drilling',
  sewer: 'Sewer works',
  connection: 'House connection',
  fibre: 'Fibre-optic cable',
  heat: 'District heating',
  power: 'Power lines',
  water: 'Water pipes',
  gas: 'Gas pipes',
  utilities: 'Utility lines',
  resurfacing: 'Road resurfacing',
  roadBuilding: 'Road building',
  sidewalk: 'Sidewalk works',
  kerb: 'Kerb lowering',
  cycle: 'Cycle path',
  lights: 'Traffic lights',
  crossing: 'Pedestrian crossing',
  levelCrossing: 'Level crossing',
  bridge: 'Bridge works',
  stairs: 'Steps or ramp',
  barriers: 'Crash barriers',
  mast: 'Mast works',
  crane: 'Crane or site setup',
  siteAccess: 'Site access',
  noParking: 'No-parking zone',
  demolition: 'Demolition',
  roof: 'Roof works',
  building: 'Building works',
  trees: 'Tree work',
  stream: 'Stream restoration',
  relocation: 'Moving utility lines',
  repairs: 'Repairs',
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Water pipes, power lines", "Emergency: burst water main": the first two kinds, so a name stays one line. */
export function workInEnglish(kinds: WorkKind[]): string {
  const rest = kinds.filter((k) => k !== 'emergency').slice(0, 2).map((k) => WORK_EN[k]);
  const named = rest.map((label, i) => (i ? lowerFirst(label) : label)).join(', ');
  if (!kinds.includes('emergency')) return named;
  return rest.length ? `Emergency: ${lowerFirst(named)}` : WORK_EN.emergency;
}

// The city's offices and generic owners; companies and agencies keep their names.
const OFFICES: [RegExp, string][] = [
  [/^stadt dortmund$/i, 'City of Dortmund'],
  [/^sta 66 - tiefbauamt$/i, 'Civil engineering office (StA 66)'],
  [/^sta 66 - tiefbauamt \/ verkehrsbauwerke$/i, 'Civil engineering office, bridges and structures (StA 66)'],
  [/^sta 66 - tiefbauamt \/ straßenoffensive$/i, 'Civil engineering office, road renewal programme (StA 66)'],
  [/^sta 66 - tiefbauamt \/ verkehrswege$/i, 'Civil engineering office, roads (StA 66)'],
  [/^sta 65 - immobilienwirtschaft$/i, 'City property office (StA 65)'],
  [/^eb70 - stadtentwässerung$/i, 'City drainage (EB70)'],
  [/^privat(?:maßnahme)?$/i, 'Private works'],
  [/^telekommunikationsanbieter$/i, 'Telecom provider'],
];

export const ownerInEnglish = (owner: string): string =>
  OFFICES.find(([re]) => re.test(owner.trim()))?.[1] ?? owner;
