import { locale, useStrings } from '../i18n';
import type { OutlookDays, OutlookResult, ProjectEvidence } from '../model/outlook';
import { formatDay } from '../model/days';
import type { Site } from '../model/sites';
import { dayRange, metres } from './format';
import { Info } from './Info';
import { SiteName } from './SiteName';
import { publishedTitle } from './siteNames';
import { useSettings } from './useSettings';

type Props = {
  result: OutlookResult; days: OutlookDays; byId: Map<string, Site>;
  mapFiltered: boolean; retrievedAt: string; scenario: boolean;
  onDays: (days: OutlookDays) => void; onMapFilter: (enabled: boolean) => void;
  onSelect: (id: string) => void;
};

export function OutlookPanel({ result, days, byId, mapFiltered, retrievedAt, scenario, onDays, onMapFilter, onSelect }: Props) {
  const cfg = useSettings();
  const t = useStrings().outlook;
  const title = (id: string) => {
    const s = byId.get(id);
    return s ? <SiteName site={s} /> : id;
  };
  const tip = (id: string) => { const s = byId.get(id); return s ? publishedTitle(s) : undefined; };
  const period = (p: ProjectEvidence) => `${p.start === null ? t.unknownStart : formatDay(p.start)} – ${p.end === null ? t.unknownEnd : formatDay(p.end)}`;
  return (
    <section className="block" aria-labelledby="outlook-title">
      <h3 id="outlook-title">{t.title}</h3>
      <Info>
        <p>{t.schedules(scenario)}</p>
        <p>{t.openEnded}</p>
        <p>{t.conflictsInfo(metres(cfg['impact.radius']))}</p>
        <p>{t.source(new Date(retrievedAt).toLocaleString(locale(), { timeZone: 'Europe/Berlin' }))}</p>
      </Info>
      <div className="segmented" role="group" aria-label={t.period}>
        {([7, 14, 30] as const).map((n) => (
          <button key={n} type="button" aria-pressed={days === n} className={days === n ? 'selected' : ''} onClick={() => onDays(n)}>{t.next(n)}</button>
        ))}
      </div>
      <p>{dayRange(result.from, result.to)}</p>
      <label className="outlook-filter"><input type="checkbox" checked={mapFiltered} onChange={(e) => onMapFilter(e.target.checked)} /> {t.filter}</label>
      <dl className="facts" aria-label={t.projects}>
        <dt>{t.starting}</dt><dd>{result.starting.length}</dd>
        <dt>{t.ongoing}</dt><dd>{result.ongoing.length}</dd>
        <dt>{t.ending}</dt><dd>{result.ending.length}</dd>
      </dl>
      <details>
        <summary>{t.overlapping(result.active.length)}</summary>
        <ul className="plain analytics-list">
          {result.active.map((p) => (
            <li key={p.id}>
              <button className="link-button" title={tip(p.id)} onClick={() => onSelect(p.id)}>{title(p.id)}</button>
              <div className="muted small">{period(p)}{p.end === null ? t.uncertainSuffix : ''}</div>
            </li>
          ))}
        </ul>
        {!result.active.length && <p className="muted">{t.noneOverlap}</p>}
      </details>
      <details>
        <summary>{t.conflicts(result.conflicts.length)}</summary>
        <ul className="plain analytics-list">
          {result.conflicts.map((c) => (
            <li key={`${c.a}:${c.b}`}>
              <button className="link-button" title={tip(c.a)} onClick={() => onSelect(c.a)}>{title(c.a)}</button> / <button className="link-button" title={tip(c.b)} onClick={() => onSelect(c.b)}>{title(c.b)}</button>
              <div className="muted small">{c.intersects ? t.touch : t.apart(metres(c.metres))} · {dayRange(c.from, c.to)}</div>
            </li>
          ))}
        </ul>
      </details>
      {!!result.uncertain.length && (
        <details>
          <summary>{t.uncertain(result.uncertain.length)}</summary>
          <p className="muted small">{t.uncertainNote}</p>
          <ul className="plain analytics-list">{result.uncertain.map((p) => <li key={p.id}><button className="link-button" title={tip(p.id)} onClick={() => onSelect(p.id)}>{title(p.id)}</button><div className="muted small">{period(p)}</div></li>)}</ul>
        </details>
      )}
    </section>
  );
}
