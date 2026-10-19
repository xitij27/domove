// The first view: every action the other views suggest, one line each, numbered like the map.
import type { ReactNode } from 'react';
import { useStrings } from '../i18n';
import type { Strings } from '../i18n';
import type { Todo } from '../model/analysis';
import { formatDay, formatShort } from '../model/days';
import type { Shift } from '../model/scenario';
import type { Settings } from '../model/settings';
import type { Site } from '../model/sites';
import { Derived } from './Derived';
import { clashText, dayRange, metres, shiftText, shortTitle } from './format';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { alignWorking, finishWorking, moveWorking, transitWorking } from './working';

type Props = {
  todo: Todo[];
  byId: Map<string, Site>;
  horizon: number | null;
  onSelectSite: (id: string) => void;
  onShift: (id: string, shift: Shift) => void;
  onOpenDistrict: (name: string) => void;
};

const sections = (cfg: Settings, t: Strings['todo']): [Todo['kind'], string, string][] => [
  ['move', t.move, t.moveAbout(metres(cfg['clash.radius']))],
  ['align', t.align, t.alignAbout],
  ['finish', t.finish, t.finishAbout],
  ['transit', t.transit, t.transitAbout(metres(cfg['reach.rail']), cfg['transit.days'])],
];

export function TodoTab({ todo, byId, horizon, onSelectSite, onShift, onOpenDistrict }: Props) {
  const cfg = useSettings();
  const t = useStrings().todo;
  const site = (s: Site) => (
    <button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button>
  );
  // each row: what it's about, the action, its numbers in plain terms, and the one button
  const row = (item: Todo): [string, ReactNode, ReactNode, ReactNode, ReactNode] => {
    switch (item.kind) {
      case 'move':
        return [
          `m${item.site.id}`, site(item.site),
          t.start(shiftText(item.option.shift)),
          t.moveNumbers(dayRange(item.option.start, item.option.end),
            <Derived how={moveWorking(item.site, item.current, item.option, cfg)}>{clashText(item.current)} → {clashText(item.option)}</Derived>),
          <button className="button" onClick={() => onShift(item.site.id, [item.option.shift, item.option.shift])}>{t.apply}</button>,
        ];
      case 'align': {
        const shift = item.start - item.second.baseStart;
        return [
          `a${item.first.id}-${item.second.id}`, site(item.second),
          t.startWith(formatShort(item.start), shortTitle(item.first.title)),
          <Derived how={alignWorking(item.first, item.second, item.start, cfg)}>{t.apartNow(item.days)}</Derived>,
          <button className="button" onClick={() => onShift(item.second.id, [shift, shift])}>{t.alignButton}</button>,
        ];
      }
      case 'finish':
        return [
          `f${item.cluster.id}`, site(item.site),
          item.site.openEnded ? t.noEnd : t.runsUntil(formatDay(item.site.end)),
          <>
            <Derived how={finishWorking(item.site, item.cluster.siteIds.flatMap((id) => (id === item.site.id ? [] : byId.get(id) ?? [])))}>
              {t.clashesWith(item.cluster.siteIds.length - 1)}
            </Derived> · {item.site.owner || t.ownerUnknown}
          </>,
          <button className="button" onClick={() => onSelectSite(item.site.id)}>{t.open}</button>,
        ];
      case 'transit':
        return [
          `t${item.gap.district}`, <strong>{item.gap.district}</strong>,
          <Derived how={transitWorking(item.gap, cfg)}>{t.farFromRail(item.gap.uncoveredSites.length)}</Derived>,
          item.gap.mainRoadSites.length ? t.onMainRoads(item.gap.mainRoadSites.length) : '',
          <button className="button" onClick={() => onOpenDistrict(item.gap.district)}>{t.open}</button>,
        ];
    }
  };

  return (
    <div className="tab-body">
      <h2 className="todo-title">{t.title(todo.length)}</h2>
      <p className="muted small">{t.intro(horizon !== null ? formatShort(horizon) : null)}</p>
      {sections(cfg, t).map(([kind, title, about]) => {
        const items = todo.flatMap((item, i) => (item.kind === kind ? [{ item, n: i + 1 }] : []));
        if (!items.length) return null;
        return (
          <section className="block" key={kind}>
            <h3>{title} <span className="count">{items.length}</span></h3>
            <Info>{about}</Info>
            <ol className="todos">
              {items.map(({ item, n }) => {
                const [key, what, action, numbers, button] = row(item);
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
