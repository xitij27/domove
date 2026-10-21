import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dailyLoad } from '../model/analysis';
import { formatShort, toDay } from '../model/days';
import { testSite } from '../model/testSites';
import { dayRange, num } from './format';
import { Timeline } from './Timeline';

// Wed 21 Oct 2026. A high-impact closure runs 11 days from today; a low-impact one from the third day for 39 days.
const today = toDay('2026-10-21');
const sites = [testSite('a', 0, 0, today, today + 10), testSite('b', 0, 0, today + 2, today + 40, { kind: 'half', road: 'local' })];
const load = dailyLoad(sites, today - 30, today + 365);
const horizon = today + 5;

const render = (opts: { date?: number; published?: boolean } = {}) => renderToStaticMarkup(
  <Timeline
    load={load} published={opts.published ? dailyLoad(sites.slice(0, 1), today - 30, today + 365) : null}
    holidays={[]} today={today} date={opts.date ?? today + 3} horizon={horizon} moved={[]} onDate={() => {}}
  />,
);
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('Timeline', () => {
  it('counts construction sites per day', () => {
    expect(text(render())).toContain('Construction sites per day');
  });

  it("reads out the chosen day's sites by impact, and its points", () => {
    const shown = text(render());
    expect(shown).toContain('2 sites');
    expect(shown).toContain('1 high · 0 medium · 1 low');
    expect(shown).toContain(`${num(1.15, 1)} points`);
  });

  it('draws a stacked bar per day, one segment per impact level', () => {
    const html = render();
    // the high-impact closure runs on 11 of the days shown, the low-impact one on 32
    expect(html.match(/class="bar high"/g)).toHaveLength(11);
    expect(html.match(/class="bar low"/g)).toHaveLength(32);
  });

  it('names the busiest day', () => {
    expect(text(render())).toContain(`Busiest day: ${formatShort(today + 2)}, 2 sites.`);
  });

  it('marks the days after the published plans end', () => {
    const shown = text(render());
    expect(shown).toContain('Not yet published');
    expect(shown).toContain(`The city has published plans up to ${formatShort(horizon)}`);
  });

  it('shows days before today only when one is chosen, and says what they miss', () => {
    expect(text(render())).not.toContain('works that have ended are missing');
    expect(text(render({ date: today - 3 }))).toContain('Before today the works that have ended are missing');
  });

  it('compares with the published plans when the scenario changes them', () => {
    expect(text(render())).not.toContain('in the published plans');
    expect(text(render({ published: true }))).toContain('1 in the published plans');
  });

  it('lists each week shown, with its busiest day, in the table', () => {
    const shown = text(render());
    expect(shown).toContain('Weekly table');
    expect(shown).toContain(dayRange(today, today + 4));
    expect(shown).toContain(dayRange(today + 33, today + 33));
  });
});
