import { describe, expect, it } from 'vitest';
import { classifyClosures, impactFor, isDaytimeOnly, worstKind } from './closures';

// Real titles from the city's feeds (17 Oct 2026), typos included.
const cases: [string, string[]][] = [
  ['Spissenagelstraße - Arbeiten an den Wasserleitungen // Vollsperrung', ['full']],
  ['Donarstr. 18a-20a - Fahrbahnsanierung // VSP', ['full']],
  ['Calvinstraße - Sondierung KVP // Vollsperrung + Umleitung', ['full']],
  ['Bothestr. -Glasfaser 1 &1 // halbs.SP.', ['half']],
  ['Lindenhorster Str. 41 - Stromanschluss // halbs. Sp.', ['half']],
  ['Hauptstraße // halbseitge Sperrung', ['half']],
  ['Hauptstraße // Halb.Sp.', ['half']],
  ['Hauptstraße // 2 BA wechselseitig', ['half']],
  ['Hauptstraße // halbs. Sp. mit Notgehweg', ['half']],
  ['Hauptstraße // Halbseitige Sperrung (Einbahnstraße fr Osten)', ['half', 'one_way']],
  ['Hauptstraße // halbs. Sp. m.LSA', ['half', 'signal']],
  ['Hauptstraße // Vollsperrung Fußweg + Baustellenausfahrt mit Ampel', ['sidewalk', 'signal']],
  ['Hauptstraße // Vollsperrung der Richtungsfahrbahn', ['carriageway']],
  ['Hauptstraße // Vollsperrung Fahrbahn - Umleitung über Fußweg Staudenweg', ['full']],
  ['Hauptstraße // Fahrbahneinengung & Gehwesperrung', ['sidewalk', 'narrowing']],
  ['Hauptstraße // Sp.-Gehweg', ['sidewalk']],
  ['Hauptstraße // teilweise Gehwegsperrung', ['sidewalk']],
  ['Hauptstraße // Fahrspureinzug (09-15 Uhr)', ['narrowing']],
  ['Hauptstraße // Einbahnstraße', ['one_way']],
  ['Hauptstraße // Vollsperrung (tagsüber) Wanderbaustelle', ['full', 'moving']],
  ['Hauptstraße // Sperrung Parkstreifen in mehreren Abschnitten', ['parking']],
  ['Emscherradweg zw. "Bergparte" und "Schürener Vorstadt" - Ausbau Radweg /// Vollsperrung', ['sidewalk']],
  ['Freie-Vogel-Straße/ Fußgängerbrücke Stadtkrone Ost - Umlegungsarbeiten /// Vollsperrung', ['sidewalk']],
  ['Adickestraße - Gehwegerneuerung // Vollsperrung (tagsüber) Wanderbaustelle', ['full', 'moving']],
  ['Dornstraße - Stromarbeiten', ['unknown']],
  ['Brückensanierung', ['unknown']],
];

describe('classifyClosures', () => {
  it.each(cases)('%s', (title, kinds) => {
    expect(classifyClosures(title)).toEqual(kinds);
  });

  it('flags daytime-only works', () => {
    expect(isDaytimeOnly('Vollsperrung (tagsüber) Wanderbaustelle')).toBe(true);
    expect(isDaytimeOnly('Fahrspureinzug (09-15 Uhr)')).toBe(true);
    expect(isDaytimeOnly('Vollsperrung')).toBe(false);
  });
});

describe('impact', () => {
  it('takes the worst kind for the planner weight', () => {
    expect(worstKind(['half', 'full', 'signal'])).toBe('full');
  });

  it('blocks per mode as #12 decided', () => {
    expect(impactFor(['full'], 'car').effect).toBe('blocked');
    expect(impactFor(['full'], 'walk')).toEqual({ effect: 'slowed', penaltyS: 60 });
    expect(impactFor(['one_way'], 'bike').effect).toBe('blocked');
    expect(impactFor(['sidewalk'], 'walk').effect).toBe('blocked');
    expect(impactFor(['unknown'], 'car').effect).toBe('none');
  });

  it('takes the highest penalty, not the sum', () => {
    expect(impactFor(['half', 'signal'], 'car')).toEqual({ effect: 'slowed', penaltyS: 120 });
  });
});
