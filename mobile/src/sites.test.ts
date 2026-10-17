import { closureOf, toSites, type SiteRow } from './sites';

const row: SiteRow = { id: 'a', status: 'planned', title: 'Stortsweg - Glasfaser', owner: null, period: '15.11.2026 - 23.12.2026', district: 'Hombruch', latitude: 51.48, longitude: 7.4 };

test('maps backend rows and drops ones with a bad status or coordinates', () => {
  const sites = toSites([
    row,
    { ...row, id: 'b', status: 'unknown' },
    { ...row, id: 'c', latitude: null as unknown as number },
  ]);

  expect(sites).toEqual([{
    id: 'a',
    status: 'planned',
    closure: 'other',
    coordinate: { latitude: 51.48, longitude: 7.4 },
    title: 'Stortsweg - Glasfaser',
    owner: '',
    period: '15.11.2026 - 23.12.2026',
    district: 'Hombruch',
  }]);
});

// Titles from the city's feeds on 17 Oct 2026.
test.each([
  ['Langenacker - Straßenbau // Vollsperrung', 'full'],
  ['Millkottenweg 1-15 - Kanal & Straßenbau // VSP', 'full'],
  ['Nevelingweg - Errichtung Wohnanlage // VSp', 'full'],
  ['B 236 Vollsperrung - Tangente FR Schwerte', 'full'],
  ['Wickeder Straße - Arbeiten an den Stromleitung // Vollsperrung u. Halbs. Sperrung', 'full'],
  ['Poststraße - Neubau // Einbahnstraße', 'one_way'],
  ['Borussiastraße - Arb. an Stromleitungen / Einbahnstraßenregelung', 'one_way'],
  ['Busenbergstraße 8a - 20 - Arbeiten an den Stromleitungen /// Halbseitige Sperrung (Einbahnstraße) + LSA', 'one_way'],
  ['Emscherradweg zw. "Bergparte" und "Schürener Vorstadt" - Ausbau Radweg /// Vollsperrung', 'cycle_path'],
  ['Preinstraße 74 - Neubau Wohnhaus // Gehwegsperrung', 'sidewalk'],
  ['Hansamnnstr. 79-83 - Dachsanierung // gehwegsp.', 'sidewalk'],
  ['Hänselweg 49 - Gehwegabsenkung // Sp.-Gehweg', 'sidewalk'],
  ['Kurze Hecke - Wasserrohrbruch // halbseitige Sperrung mit Ampel', 'signal'],
  ['Alfred-Lange-Str./Schwieringshauser Str. - Wasserleitung // halbs. Sp. m.LSA', 'signal'],
  ['Mengeder Str. 590-600a - halbs. Sp. mit LSA // Brückensanierung', 'signal'],
  // the footpath is closed, the road has temporary lights
  ['An der Goymark - Herstellung Baustellenzufahrt // Vollsperrung Fußweg + Baustellenausfahrt mit Ampel', 'signal'],
  ['Feldstraße 81 - Kranstellung für Neubau // Halbseitige Sperrung', 'half'],
  ['Bothestr. -Glasfaser 1 &1 // halbs.SP.', 'half'],
  ['Am Gulloh - Barrierefreiheit // halb.Sp.', 'half'],
  ['Deutsche STr. 5 - Notmaßnahme // halbs. Sp. mit Notgehweg', 'half'],
  ['Linnigmannstr. 26 - Hausanschluss /// Fahrbahneinengung', 'narrowing'],
  ['Bundesstraße B1 - Demontage und Montage Treppe /// Fahrspureinzug (09-15 Uhr)', 'narrowing'],
  // the lights are the work here, not the restriction
  ['Hülshof/Oberfeldstr. - Austausch LSA // Einengung', 'narrowing'],
  ['Bodelschwingher Str. 211-217 - Dach-& Fassadensanierung // Fahrbahneinengung & Gehwesperrung', 'narrowing'],
  ['Leostraße - Fahrbahnerneuerung', 'other'],
  ['Hochofenstraße - Gehwegsanierung // halbseitige Sperrung', 'half'],
  ['Universitätsstraße - Glasfaserausbau // Sperrung Parkstreifen in mehreren Abschnitten', 'other'],
])('%s is %s', (title, closure) => {
  expect(closureOf(title)).toBe(closure);
});
