// A feed title split into where the works are and what is being done there. The city writes them as
// "place - work // restriction", with "/", "//", "///", "_" or "-" between the parts, short forms and typos.
// What a site closes is already read from the whole title (closures.ts), so the restriction is left out here.

export type WorkKind =
  | 'emergency' | 'ordnance' | 'burst' | 'sinkhole' | 'mining' | 'sewer' | 'connection' | 'fibre' | 'heat'
  | 'power' | 'water' | 'gas' | 'utilities' | 'resurfacing' | 'roadBuilding' | 'sidewalk' | 'kerb' | 'cycle'
  | 'lights' | 'crossing' | 'levelCrossing' | 'bridge' | 'stairs' | 'barriers' | 'mast' | 'crane' | 'siteAccess'
  | 'noParking' | 'demolition' | 'roof' | 'building' | 'trees' | 'stream' | 'relocation' | 'repairs';

// Matched on the lower-cased work with ß written as ss, in this order, which is also the order they are named in.
const WORK: [WorkKind, RegExp][] = [
  ['emergency', /notmass|notfall|notstütz/],
  // KVP: Kampfmittelverdachtspunkt, a suspected wartime bomb
  ['ordnance', /kampfmittel|\bkvp\b|sondierung/],
  ['burst', /rohr?bruch/],
  ['sinkhole', /tagesbruch/],
  ['mining', /bergbau|erkundungsbohr/],
  ['sewer', /kanal|entwässer|(?:regen|ab)wasser|\bsw-|(?<!wärme)schacht/],
  ['connection', /anschl|naschl/],
  // Glasfaser, and the feed's Glalsfaser, Galsfaser and Glasfaer
  ['fibre', /g(?:la|al)l?sfa/],
  ['heat', /fernwärme/],
  ['power', /strom|trafo/],
  ['water', /(?<!regen|ab)wasser(?!roh)|hydr(?:ant|omat)/],
  ['gas', /\bgas/],
  ['utilities', /versorgungsleitung/],
  ['resurfacing', /fahrbahn|asphalt|decken|belag|strassensan/],
  ['roadBuilding', /strassenbau/],
  ['sidewalk', /gehweg(?!absenk)|fussweg|parkstreifen/],
  ['kerb', /absenkung|bordstein/],
  ['cycle', /radweg/],
  ['lights', /(?:austausch|aufstellung|erneuerung|umbau)\b.{0,20}\blsa\b|\blsa\b.{0,3}(?:austausch|umbau|erneuerung)|ampelanlage|signalanlage/],
  ['crossing', /überweg|zebrastreifen/],
  ['levelCrossing', /bahnübergang/],
  ['bridge', /brück|bauwerk|überbau/],
  ['stairs', /treppe|rampe/],
  ['barriers', /rückhalte|leitplank/],
  ['mast', /mast/],
  ['crane', /kran|container|bauaufzug|be-fläche|baustelleneinrichtung/],
  ['siteAccess', /baustellen(?:ein|zu|aus)fahrt/],
  ['noParking', /halte?verbot/],
  ['demolition', /abbruch|abriss|rückbau/],
  ['roof', /\bdach/],
  ['building', /hochbau|neubau|hausbau|wohn|\bmfh\b|parkhaus|bürogeb|gebäude|energetisch/],
  ['trees', /baum/],
  ['stream', /ökolog|renaturier|becke\b|bach\b|dücker/],
  ['relocation', /umlegung|umverlegung/],
];
// Only when nothing more telling is named.
const REPAIRS = /sanier|instand|reparatur/;

const normalize = (text: string) => text.toLowerCase().replaceAll('ß', 'ss');

/** What kinds of work a feed's work text names; empty when none is recognised. */
export function workKinds(work: string): WorkKind[] {
  const text = normalize(work);
  const found = WORK.filter(([, re]) => re.test(text)).map(([kind]) => kind);
  return found.length || !REPAIRS.test(text) ? found : ['repairs'];
}

// A piece that only says what is closed: "Vollsperrung", "halbs. Sp.", "Einbahnstraßenregelung", "+ LSA".
const RESTRICTION = /sperr|\bsp\b|\bvsp\b|einengung|spureinzug|verengung|fahrstreifen|einbahn|umleitung|halbs|wechselseitig|gesperrt|wanderbaustelle|abschnitt|\d\s*ba\b|wegsp\b|\buhr\b|tagsüber|notgehweg|^(?:mit\s+)?(?:lsa|ampel)$/;
const SEGMENTS = /\s*\/{2,}\s*/;
// Between place and work: " - ", " -", "x- " (not "2- 10"), " _ ".
const DASH = /\s+[-–_]\s*|(?<=[^\d\s])[-–]\s+/g;
const SLASH = /\s+\/\s+/;
// Between the pieces of a work, kept so the work reads as the city wrote it.
const PIECES = /(\s+\/\s+|,\s+|\s+[-–]\s*|\s*\(\s*|\s+[+&]\s+)/;
const HOUSE_NUMBER = /^\d+\s*[a-z]?$/i;
// A construction phase: "Fernwärme BA3", "Kanalsanierung (BA 2)"
const PHASE = /\s*\(?\bBA\s*\d+\)?/g;
const TRAILING_RESTRICTION = /\s+(?:(?:voll|halbseitige)\s*)?sperrung$/i;

/** The place and the work, split where the city put a dash, an underscore or a spaced slash. */
function splitHead(head: string): [string, string] {
  for (const m of head.matchAll(DASH)) {
    const rest = head.slice(m.index + m[0].length);
    // "Busenbergstraße 8a - 20 - Arbeiten …": the dash inside a house-number range is part of the place
    const next = rest.split(DASH)[0];
    if (HOUSE_NUMBER.test(next.trim()) && next.length < rest.length) continue;
    return [head.slice(0, m.index), rest];
  }
  const slash = head.match(SLASH);
  if (slash?.index !== undefined) return [head.slice(0, slash.index), head.slice(slash.index + slash[0].length)];
  // "Tannenstraße 7 Hausneubau": the work follows the house number
  const numbered = head.match(/^(.*?\d+\w?)\s+(\S.*)$/);
  if (numbered && workKinds(numbered[2]).length) return [numbered[1], numbered[2]];
  return [head, ''];
}

/** The work without the pieces that only say what is closed. */
function withoutRestrictions(work: string): string {
  const parts = work.replace(PHASE, '').split(PIECES);
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i].trim();
    if (!piece || RESTRICTION.test(normalize(piece))) continue;
    out += (out ? parts[i - 1] : '') + piece;
  }
  out = out.replace(/\s*\($/, '').trim();
  const open = out.split('(').length;
  const close = out.split(')').length;
  return close > open ? out.replace(/\)(?=[^)]*$)/, '') : out;
}

export type SiteTitle = { place: string; work: string };

export function parseTitle(title: string): SiteTitle {
  const [head, ...rest] = title.split(SEGMENTS);
  const [place, headWork] = splitHead(head.trim());
  const work = [headWork, ...rest].map(withoutRestrictions).filter(Boolean).join(', ');
  return { place: place.replace(TRAILING_RESTRICTION, '').trim() || title.trim(), work };
}
