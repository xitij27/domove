import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sources from './sources';
import { loadDashboard } from './useData';
import { toDay } from '../model/days';

const poi = (name: string) => ({ name, detail: '', district: '', at: [7.46, 51.51] as [number, number] });
beforeEach(() => {
  for (const name of ['fetchSites', 'fetchRoads', 'fetchStops', 'fetchBikeStations', 'fetchParkRide', 'fetchFireStations',
    'fetchHospitals', 'fetchDistricts', 'fetchProgramme', 'fetchHolidays', 'fetchSchools', 'fetchKindergartens'] as const) {
    vi.spyOn(sources, name).mockResolvedValue([]);
  }
  vi.spyOn(sources, 'fetchResidents').mockResolvedValue({ year: '', byKey: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('optional analytics data integration', () => {
  it('reuses fetched stops and combines public facilities without additional requests', async () => {
    vi.mocked(sources.fetchStops).mockResolvedValue([poi('Stop')]);
    vi.mocked(sources.fetchSchools).mockResolvedValue([poi('School')]);
    vi.mocked(sources.fetchKindergartens).mockResolvedValue([poi('Kindergarten')]);
    const state = await loadDashboard(toDay('2026-10-17'));
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('Expected ready state');
    expect(state.data.analytics.publicLocations?.map((p) => p.name)).toEqual(['School', 'Kindergarten', 'Stop']);
    expect(sources.fetchStops).toHaveBeenCalledTimes(1);
    expect(state.data.analytics).toMatchObject({ roadsAvailable: true, stopsAvailable: true });
    expect(Number.isFinite(Date.parse(state.data.retrievedAt))).toBe(true);
  });
  it('keeps the dashboard available but withholds exposure for an incomplete source set', async () => {
    vi.mocked(sources.fetchSchools).mockRejectedValue(new Error('Schools: HTTP 503'));
    const state = await loadDashboard(toDay('2026-10-17'));
    if (state.status !== 'ready') throw new Error('Expected graceful degradation');
    expect(state.data.analytics.publicLocations).toBeNull();
    expect(state.problems).toContain('Schools: HTTP 503');
    expect(state.data.raw).toEqual([]);
  });
  it('distinguishes unavailable road and stop data from an empty successful response', async () => {
    vi.mocked(sources.fetchRoads).mockRejectedValue(new Error('Road network unavailable'));
    vi.mocked(sources.fetchStops).mockRejectedValue(new Error('Stops unavailable'));
    const state = await loadDashboard(toDay('2026-10-17'));
    if (state.status !== 'ready') throw new Error('Expected graceful degradation');
    expect(state.data.analytics).toEqual({ roadsAvailable: false, stopsAvailable: false, publicLocations: null });
    expect(state.data.stops).toEqual([]);
  });
  it('preserves the required construction-data error rather than substituting demo projects', async () => {
    vi.mocked(sources.fetchSites).mockRejectedValue(new Error('Construction sites unavailable'));
    expect(await loadDashboard(toDay('2026-10-17'))).toEqual({ status: 'failed', message: 'Construction sites unavailable' });
  });
});
