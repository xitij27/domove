import { describe, expect, it } from 'vitest';
import { districtKey, parseProgramme, parseSites } from './sources';

describe('parseSites', () => {
  it('keeps valid sites and their polygons, and skips broken rows', () => {
    const body = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[[[7.45, 51.5], [7.451, 51.5], [7.451, 51.501], [7.45, 51.5]]]] },
          properties: {
            id: 'a1', status: 'planned', title: 'Calvinstraße // Vollsperrung', owner: 'Stadt Dortmund', district: 'Innenstadt-Ost',
            starts_on: '2026-10-22', ends_on: '2026-11-27', latitude: 51.5005, longitude: 7.4505,
          },
        },
        { type: 'Feature', geometry: null, properties: { id: 'b2', status: 'current', title: 'X', latitude: 51.5, longitude: 7.45, starts_on: 'soon' } },
        { type: 'Feature', geometry: null, properties: { id: 'c3', status: 'done', latitude: 51.5, longitude: 7.45 } },
        { type: 'Feature', geometry: null, properties: { id: 'd4', status: 'current', latitude: 'x', longitude: 7.45 } },
      ],
    };
    const sites = parseSites(body);
    expect(sites.map((s) => s.id)).toEqual(['a1', 'b2']);
    expect(sites[0]).toMatchObject({ startsOn: '2026-10-22', center: [7.4505, 51.5005] });
    expect(sites[0].geometry?.type).toBe('MultiPolygon');
    expect(sites[1]).toMatchObject({ startsOn: null, geometry: null, owner: '' });
  });

  it('rejects a response that is not a FeatureCollection', () => {
    expect(() => parseSites([{ id: 'a' }])).toThrow('unexpected response');
  });
});

describe('parseProgramme', () => {
  it('reads stages, flags and the citywide district', () => {
    const [p] = parseProgramme([{
      projektnummer: '8', bezeichnung: 'Märkische Straße, Brückenplatte 1', stadtbezirk: 'Überörtlich', gewerk: 'Straße komplex',
      '2026_iii': 'Bau', '2027': 'Schlussrechnung', massnahmenstatus: 'im Bau', prioritatenklasse: '1', summe_gewichtungspunkte: 23,
      bewertungstatbestand_verkehrliche_bedeutung_hauptstrassen_gewichtung_1_punkt: 'Verkehrliche Bedeutung (Hauptstraßen)',
      bewertungstatbestand_opnv_barrierefreiheit_gewichtung_3_punkte: null,
    }]);
    expect(p).toMatchObject({ id: '8', district: 'Citywide', points: 23, mainRoad: true, transit: false });
    expect(p.stages['2026_iii']).toBe('Bau');
    expect(p.stages['2028']).toBe('');
  });
});

it('matches district names to the population table columns', () => {
  expect(districtKey('Hörde')).toBe('horde');
  expect(districtKey('Lütgendortmund')).toBe('lutgendortmund');
  expect(districtKey('Innenstadt-West')).toBe('innenstadt_west');
});
