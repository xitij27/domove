import { describe, expect, it } from 'vitest';
import { parseTitle, workKinds } from './siteName';

// Titles as the city's feed writes them, separators, abbreviations and typos included.
const parts: [string, string, string][] = [
  ['Spissenagelstraße - Arbeiten an den Wasserleitungen // Vollsperrung', 'Spissenagelstraße', 'Arbeiten an den Wasserleitungen'],
  ['Thomas-Mann-Straße / Entwässerung + Asphaltarbeiten // Vollsperrung', 'Thomas-Mann-Straße', 'Entwässerung + Asphaltarbeiten'],
  ['Bundesstraße B1 - Demontage und Montage Treppe /// Fahrspureinzug (09-15 Uhr)', 'Bundesstraße B1', 'Demontage und Montage Treppe'],
  ['Flughafenstraße - Fahrbahnsanierung / Vollsperrung', 'Flughafenstraße', 'Fahrbahnsanierung'],
  ['Baroper Heidestraße - KVP', 'Baroper Heidestraße', 'KVP'],
  ['Mallinckrodtstr./OWIIA - Einengung // Bauwerksprüfung', 'Mallinckrodtstr./OWIIA', 'Bauwerksprüfung'],
  ['Bothestr. -Glasfaser 1 &1 // halbs.SP.', 'Bothestr.', 'Glasfaser 1 &1'],
  ['Posthornweg-Wrangelstr. _ Glasfaserausbau // VSP', 'Posthornweg-Wrangelstr.', 'Glasfaserausbau'],
  ['Freie-Vogel-Straße/ Fußgängerbrücke Stadtkrone Ost - Umlegungsarbeiten /// Vollsperrung', 'Freie-Vogel-Straße/ Fußgängerbrücke Stadtkrone Ost', 'Umlegungsarbeiten'],
  ['Bienenstraße / Küsterkamp - Arbeiten an den Versorgungsleitungen // Halbseitige Sperrung', 'Bienenstraße / Küsterkamp', 'Arbeiten an den Versorgungsleitungen'],
  ['Busenbergstraße 8a - 20 - Arbeiten an den Stromleitungen /// Halbseitige Sperrung (Einbahnstraße) + LSA', 'Busenbergstraße 8a - 20', 'Arbeiten an den Stromleitungen'],
  ['Walter-Behrendt-Straße // Sondierung KVP // Vollsperrung', 'Walter-Behrendt-Straße', 'Sondierung KVP'],
  ['Rheinlanddamm // Kranarbeiten am Funkmast -Spureinzug (halbseitige Sperrung', 'Rheinlanddamm', 'Kranarbeiten am Funkmast'],
  ['Neuer Graben // Kanalbau / Vollsperrung', 'Neuer Graben', 'Kanalbau'],
  ['Westfalendamm - Kampfmittelverdachtspunkt / halbseitige Sperrung, Spureinzug', 'Westfalendamm', 'Kampfmittelverdachtspunkt'],
  ['Borussiastraße - Arb. an Stromleitungen / Einbahnstraßenregelung', 'Borussiastraße', 'Arb. an Stromleitungen'],
  ['Erlemannsweg 2- 10 Straßensanierung', 'Erlemannsweg 2- 10', 'Straßensanierung'],
  ['Tannenstraße 7 Hausneubau', 'Tannenstraße 7', 'Hausneubau'],
  ['B 236 Vollsperrung - Tangente FR Schwerte', 'B 236', 'Tangente FR Schwerte'],
  ['Hauptstraße // Vollsperrung', 'Hauptstraße', ''],
  ['Leostraße - Fahrbahnerneuerung', 'Leostraße', 'Fahrbahnerneuerung'],
  ['Kanalstraße', 'Kanalstraße', ''],
  ['New school on Hauptstraße', 'New school on Hauptstraße', ''],
];

describe('parseTitle', () => {
  it.each(parts)('%s', (title, place, work) => {
    expect(parseTitle(title)).toEqual({ place, work });
  });
});

const kinds: [string, string[]][] = [
  ['Arbeiten an den Wasserleitungen', ['water']],
  ['Entwässerung + Asphaltarbeiten', ['sewer', 'resurfacing']],
  ['Glalsfaserverlegung', ['fibre']],
  ['Galsfaser 1 & 1', ['fibre']],
  ['Glasfaer', ['fibre']],
  ['Arbeiten an Wasser-und Stromleitungen', ['power', 'water']],
  ['Notmaßnahme- Wasserrohbruch', ['emergency', 'burst']],
  ['Notfallreparatur am SW-Hausnaschluss', ['emergency', 'sewer', 'connection']],
  ['Hausanschluss (Strom/ Wasser)', ['connection', 'power', 'water']],
  ['Regenwasseranschluss', ['sewer', 'connection']],
  ['KVP', ['ordnance']],
  ['Sondierung KVP', ['ordnance']],
  ['Austausch LSA', ['lights']],
  ['Gehwegabsenkung', ['kerb']],
  ['Gehwegerneuerung', ['sidewalk']],
  ['Kran-/Containerstellung für Hausbau', ['crane', 'building']],
  ['Brückeninstandhaltung', ['bridge']],
  ['Baumfällung', ['trees']],
  ['Ökologische Verbesserung der Archenbecke', ['stream']],
  ['Kanal- und Straßenbauarbeiten', ['sewer', 'roadBuilding']],
  ['Sanierung Jugendamt', ['repairs']],
  ['Fahrbahnsanierung', ['resurfacing']],
  ['Tangente FR Schwerte', []],
];

describe('workKinds', () => {
  it.each(kinds)('%s', (work, expected) => {
    expect(workKinds(work)).toEqual(expected);
  });
});

describe('feed quirks', () => {
  it('keeps traffic-light work that names LSA first', () => {
    expect(parseTitle('Derner Str./An den Teichen -LSA Austausch // Einengung').work).toBe('LSA Austausch');
  });
  it('drops construction phases', () => {
    expect(parseTitle('Kronprinzenstraße - Fernwärme BA3 // Vollsperrung').work).toBe('Fernwärme');
    expect(parseTitle('In der Liethe / Am Brandhof - Kanalsanierung (BA 2) // Vollsperrung').work).toBe('Kanalsanierung');
  });
  it('drops a closed sidewalk written as one word', () => {
    expect(parseTitle('Hansamnnstr. 79-83 - Dachsanierung // gehwegsp.').work).toBe('Dachsanierung');
  });
  it('reads no roof into a suspected wartime bomb', () => {
    expect(workKinds('Kampfmittelverdachtspunkt')).toEqual(['ordnance']);
  });
});
