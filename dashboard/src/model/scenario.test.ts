import { describe, expect, it } from 'vitest';
import { toDay } from './days';
import { applyShifts, changeCount, decodeScenario, encodeScenario, scenarioCsv } from './scenario';
import type { Scenario } from './scenario';
import { testSite } from './testSites';

const start = toDay('2026-11-02');
const scenario: Scenario = {
  shifts: { a: [14, 14], b: [0, -10] },
  added: [{ id: 'h1', name: 'Kanal Hörde', kind: 'full', center: [7.49, 51.48], radius: 40, start, days: 30 }],
};

describe('scenario link', () => {
  it('round-trips through the URL hash, umlauts included', () => {
    expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
    expect(encodeScenario(scenario)).toMatch(/^[\w-]+$/);
  });

  it('drops anything malformed instead of throwing', () => {
    const evil = btoa(JSON.stringify({
      shifts: { ok: [1, 1], 'x"><script>': [1, 1], big: [99999, 0], frac: [1.5, 1], short: [1] },
      added: [
        { ...scenario.added[0], id: 'bad id!' },
        { ...scenario.added[0], kind: 'toString' },
        { ...scenario.added[0], center: [13.4, 52.5] },
        { ...scenario.added[0], id: 'fine', name: '  ' },
      ],
    }));
    expect(decodeScenario(evil)).toEqual({ shifts: { ok: [1, 1] }, added: [{ ...scenario.added[0], id: 'fine', name: 'Proposed project' }] });
    expect(decodeScenario('not base64 at all!')).toEqual({ shifts: {}, added: [] });
    expect(decodeScenario(btoa('null'))).toEqual({ shifts: {}, added: [] });
  });
});

describe('applyShifts', () => {
  it('moves planned works and shortens running ones', () => {
    const [a, b] = applyShifts([testSite('a', 0, 0, 100, 110), testSite('b', 0, 0, 50, 120)], { a: [14, 14], b: [0, -10] });
    expect([a.start, a.end, a.baseStart]).toEqual([114, 124, 100]);
    expect([b.start, b.end]).toEqual([50, 110]);
  });
});

describe('scenarioCsv', () => {
  it('lists a moved proposed project once, with its moved dates', () => {
    const moved: Scenario = { shifts: { h1: [5, 5] }, added: [scenario.added[0]] };
    const site = testSite('h1', 0, 0, start, start + 29, { hypothetical: true, title: 'Kanal Hörde' });
    const csv = scenarioCsv(moved, applyShifts([site], moved.shifts));
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain(';2026-11-07;2026-12-06;;New project');
    expect(changeCount(moved)).toBe(1);
    expect(changeCount(scenario)).toBe(3);
  });

  it('writes semicolon rows and defuses formulas in feed text', () => {
    const site = testSite('a', 0, 0, start, start + 9, { title: '=HYPERLINK("http://x");Weg', owner: 'Stadt Dortmund' });
    const [shifted] = applyShifts([site], { a: [7, 7] });
    const csv = scenarioCsv({ shifts: { a: [7, 7] }, added: [] }, [shifted]);
    const [header, row] = csv.slice(1).trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(header.split(';')).toHaveLength(11);
    expect(row).toBe(`"'=HYPERLINK(""http://x"");Weg";Stadt Dortmund;Innenstadt-West;Full closure;main road;2026-11-02;2026-11-11;2026-11-09;2026-11-18;7;Move`);
  });
});
