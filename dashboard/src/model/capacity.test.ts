import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, simulate } from './capacity';
import { testSite } from './testSites';

const capacity = new Map([['A', 100], ['B', 100], ['Empty', 0]]);
const residents = new Map([['A', 1000], ['B', 1000], ['Empty', 500]]);

describe('simulate', () => {
  it('puts a district with as many people as roads at the citywide level', () => {
    const r = simulate([], capacity, residents, 10, DEFAULT_PARAMS);
    expect(r.districts.find((d) => d.district === 'A')!.load).toBeGreaterThan(0.6);
    expect(r.citywide).toBeCloseTo(0.7);
    expect(r.districts.find((d) => d.district === 'Empty')!.load).toBeNull();
  });

  it('scales load with population and car use, and reports the headroom', () => {
    const base = simulate([], capacity, residents, 10, DEFAULT_PARAMS);
    const more = simulate([], capacity, residents, 10, { ...DEFAULT_PARAMS, population: 1.2, carUse: 1.1 });
    expect(more.citywide).toBeCloseTo(base.citywide * 1.32);
    expect(more.headroom).toBeCloseTo(base.headroom); // headroom is counted from today's levels, whatever the sliders say
  });

  it('takes capacity away from the district of an active site only', () => {
    const site = testSite('s', 0, 0, 10, 20, { district: 'A' });
    const on = simulate([site], capacity, residents, 15, DEFAULT_PARAMS);
    const off = simulate([site], capacity, residents, 30, DEFAULT_PARAMS);
    const a = (r: typeof on) => r.districts.find((d) => d.district === 'A')!;
    expect(a(on).load!).toBeGreaterThan(a(off).load!);
    expect(a(on).lost).toBeGreaterThan(0);
    expect(on.districts.find((d) => d.district === 'B')!.lost).toBe(0);
    expect(a(off).load).toBeCloseTo(a(off).loadWithoutWorks!);
  });
});
