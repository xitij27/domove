// The first view: every action the other views suggest, one line each, numbered like the map.
import type { ReactNode } from 'react';
import type { Todo } from '../model/analysis';
import { formatDay, formatShort } from '../model/days';
import type { Shift } from '../model/scenario';
import type { Site } from '../model/sites';
import { clashText, dayRange, plural, shiftText, shortTitle } from './format';
import { Info } from './Info';

type Props = {
  todo: Todo[];
  horizon: number | null;
  onSelectSite: (id: string) => void;
  onShift: (id: string, shift: Shift) => void;
  onOpenDistrict: (name: string) => void;
};

const SECTIONS: [Todo['kind'], string, string][] = [
  ['move', 'Move to avoid clashes', 'Planned works that run at the same time as other serious works within 1 km, so their detours pile up. "3 sites on 40 days" means: on 40 days, up to 3 other sites nearby are running too. Apply tries the move in your scenario.'],
  ['align', 'Do together', 'Works on the same stretch of street at different times. Starting the later one while the first runs closes the street once instead of twice.'],
  ['finish', 'Ask to finish sooner', 'Clashes that no date move can clear, because the works are already running. The one listed runs longest; finishing it sooner ends the clash.'],
  ['transit', 'Transit help', 'Districts with closures more than 600 m from a Stadtbahn stop, or on main roads where buses run, from the day shown for 30 days. Open shows suggested actions.'],
];

export function TodoTab({ todo, horizon, onSelectSite, onShift, onOpenDistrict }: Props) {
  const site = (s: Site) => (
    <button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button>
  );
  // each row: what it's about, the action, its numbers in plain terms, and the one button
  const row = (t: Todo): [string, ReactNode, string, string, ReactNode] => {
    switch (t.kind) {
      case 'move':
        return [
          `m${t.site.id}`, site(t.site),
          `Start ${shiftText(t.option.shift)}`,
          `${dayRange(t.option.start, t.option.end)} · clashes ${clashText(t.current)} → ${clashText(t.option)}`,
          <button className="button" onClick={() => onShift(t.site.id, [t.option.shift, t.option.shift])}>Apply</button>,
        ];
      case 'align': {
        const shift = t.start - t.second.baseStart;
        return [
          `a${t.first.id}-${t.second.id}`, site(t.second),
          `Start on ${formatShort(t.start)} with ${shortTitle(t.first.title)}`,
          `same street, ${plural(t.days, 'day')} apart now`,
          <button className="button" onClick={() => onShift(t.second.id, [shift, shift])}>Align</button>,
        ];
      }
      case 'finish':
        return [
          `f${t.cluster.id}`, site(t.site),
          t.site.openEnded ? 'No end date: ask for one' : `Runs until ${formatDay(t.site.end)}`,
          `clashes with ${plural(t.cluster.siteIds.length - 1, 'site')} · ${t.site.owner || 'owner unknown'}`,
          <button className="button" onClick={() => onSelectSite(t.site.id)}>Open</button>,
        ];
      case 'transit':
        return [
          `t${t.gap.district}`, <strong>{t.gap.district}</strong>,
          `${plural(t.gap.uncoveredSites.length, 'closure')} far from the Stadtbahn`,
          t.gap.mainRoadSites.length ? `${plural(t.gap.mainRoadSites.length, 'closure')} on main roads` : '',
          <button className="button" onClick={() => onOpenDistrict(t.gap.district)}>Open</button>,
        ];
    }
  };

  return (
    <div className="tab-body">
      <h2 className="todo-title">{todo.length ? `${plural(todo.length, 'thing')} to act on` : 'Nothing to act on'}</h2>
      <p className="muted small">
        Numbers match the map. Changes stay in your scenario until you share them{horizon !== null ? `; works published up to ${formatShort(horizon)} are known` : ''}.
      </p>
      {SECTIONS.map(([kind, title, about]) => {
        const items = todo.flatMap((t, i) => (t.kind === kind ? [{ t, n: i + 1 }] : []));
        if (!items.length) return null;
        return (
          <section className="block" key={kind}>
            <h3>{title} <span className="count">{items.length}</span></h3>
            <Info>{about}</Info>
            <ol className="todos">
              {items.map(({ t, n }) => {
                const [key, what, action, numbers, button] = row(t);
                return (
                  <li key={key}>
                    <span className="todo-n" aria-hidden="true">{n}</span>
                    <div><div>{what}</div><div className="small">{action}{numbers && <span className="muted"> · {numbers}</span>}</div></div>
                    {button}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
