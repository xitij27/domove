import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, simulate } from '../model/capacity';
import { DEFAULT_SETTINGS } from '../model/settings';
import { testSite } from '../model/testSites';
import { pct } from './format';
import { citywideWorking, loadWorking } from './working';

const capacity = new Map([['A', 120], ['B', 80]]);
const residents = new Map([['A', 1000], ['B', 3000]]);

describe('capacity working', () => {
  // the rows redo the sum from the shares they show, so they only agree with the bar if the model's parts add up
  it('ends on the load and network figures the tab shows, with works and growth', () => {
    const params = { ...DEFAULT_PARAMS, population: 1.1, carUse: 0.9 };
    const r = simulate([testSite('s', 0, 0, 10, 20, { district: 'A' })], capacity, residents, 15, params);
    for (const d of r.districts) {
      const rows = new Map(loadWorking(d, r, params, DEFAULT_SETTINGS));
      expect(rows.get('Growth')).toMatch(new RegExp(`= ${pct(d.load!)}$`));
      expect(rows.get('Load')).toMatch(new RegExp(`= ${pct(d.load! / 0.99)}$`));
    }
    expect(new Map(citywideWorking(r, params)).get('Network')).toMatch(new RegExp(`= ${pct(r.citywide)}$`));
  });
});
