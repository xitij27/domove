import { useCallback, useEffect, useState } from 'react';
import { isoDay } from '../model/days';
import * as src from './sources';
import type { District, Holiday, Poi, ProgrammeProject, RawSite, Road } from './sources';

export type Dataset = {
  raw: RawSite[];
  roads: Road[];
  stops: Poi[];
  bikes: Poi[];
  parkRide: Poi[];
  fire: Poi[];
  hospitals: Poi[];
  districts: District[];
  residents: Map<string, number>;
  residentsYear: string;
  programme: ProgrammeProject[];
  holidays: Holiday[];
};
export type DataState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; data: Dataset; problems: string[] };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The sites are required; every other layer may fail on its own and is then reported, not fatal. */
async function load(today: number): Promise<DataState> {
  const results = await Promise.allSettled([
    src.fetchSites(), src.fetchRoads(), src.fetchStops(), src.fetchBikeStations(), src.fetchParkRide(), src.fetchFireStations(),
    src.fetchHospitals(), src.fetchDistricts(), src.fetchResidents(), src.fetchProgramme(), src.fetchHolidays(isoDay(today - 30), isoDay(today + 400)),
  ] as const);
  const [sites, roads, stops, bikes, parkRide, fire, hospitals, districts, residents, programme, holidays] = results;
  if (sites.status === 'rejected') return { status: 'failed', message: message(sites.reason) };
  const problems: string[] = [];
  const value = <T,>(r: PromiseSettledResult<T>, fallback: T): T => {
    if (r.status === 'fulfilled') return r.value;
    problems.push(message(r.reason));
    return fallback;
  };
  const districtList = value(districts, []);
  const people = value(residents, { year: '', byKey: {} });
  return {
    status: 'ready',
    problems,
    data: {
      raw: sites.value,
      roads: value(roads, []),
      stops: value(stops, []),
      bikes: value(bikes, []),
      parkRide: value(parkRide, []),
      fire: value(fire, []),
      hospitals: value(hospitals, []),
      districts: districtList,
      residents: new Map(districtList.map((d) => [d.name, people.byKey[src.districtKey(d.name)] ?? 0])),
      residentsYear: people.year,
      programme: value(programme, []),
      holidays: value(holidays, []),
    },
  };
}

export function useData(today: number): { state: DataState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DataState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    load(today).then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [today, attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);
  return { state, retry };
}
