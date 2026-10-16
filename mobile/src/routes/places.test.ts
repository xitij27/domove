import { searchPlaces, toPlaces } from './places';

// Trimmed from a real Photon response for "Hauptbahnhof Dortmund" and "Hainallee 1".
const feature = (properties: Record<string, unknown>, coordinates: unknown) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const photon = {
  type: 'FeatureCollection',
  features: [
    feature({ name: 'Hauptbahnhof Dortmund', street: 'Königswall', city: 'Dortmund', postcode: '44137' }, [7.4592763, 51.5168242]),
    feature({ name: 'Hauptbahnhof Dortmund', street: 'Königswall', city: 'Dortmund' }, [7.4592805, 51.516825]),
    feature({ street: 'Hainallee', housenumber: '1', city: 'Dortmund' }, [7.4706046, 51.5056422]),
    feature({ name: 'Pisé-Haus', street: 'Hainallee', housenumber: '1', city: 'Weilburg' }, [8.2595141, 50.4870192]),
    feature({ name: 'Dortmund', city: 'Dortmund' }, [7.4652981, 51.5142273]),
    feature({ name: 'Swapped' }, [51.5, 97.4]),
    feature({ name: 'Text coordinates' }, ['7.46', '51.51']),
    feature({}, [7.46, 51.51]),
  ],
};

test('turns Photon features into labelled places, once per label', () => {
  expect(toPlaces(photon)).toEqual([
    { label: 'Hauptbahnhof Dortmund, Königswall, Dortmund', coordinate: { latitude: 51.5168242, longitude: 7.4592763 } },
    { label: 'Hainallee 1, Dortmund', coordinate: { latitude: 51.5056422, longitude: 7.4706046 } },
    { label: 'Pisé-Haus, Hainallee 1, Weilburg', coordinate: { latitude: 50.4870192, longitude: 8.2595141 } },
    { label: 'Dortmund', coordinate: { latitude: 51.5142273, longitude: 7.4652981 } },
  ]);
});

test('shows at most five places and survives unexpected bodies', () => {
  const many = { features: Array.from({ length: 8 }, (_, i) => feature({ name: `Place ${i}` }, [7.46, 51.51])) };
  expect(toPlaces(many)).toHaveLength(5);
  expect(toPlaces(null)).toEqual([]);
  expect(toPlaces({ message: 'rate limited' })).toEqual([]);
});

test('asks Photon near Dortmund and reports HTTP errors', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => photon }).mockResolvedValueOnce({ ok: false, status: 429 });
  globalThis.fetch = fetchMock;
  try {
    await expect(searchPlaces('Hbf & Co')).resolves.toHaveLength(4);
    expect(fetchMock.mock.calls[0][0]).toBe('https://photon.komoot.io/api/?q=Hbf%20%26%20Co&lat=51.514&lon=7.468&lang=de&limit=10');
    await expect(searchPlaces('Hbf')).rejects.toThrow('HTTP 429');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
