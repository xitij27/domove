import type { OutlookDays, OutlookResult, ProjectEvidence } from '../model/outlook';
import { formatDay } from '../model/days';
import type { Site } from '../model/sites';
import { dayRange, metres } from './format';

type Props = {
  result: OutlookResult; days: OutlookDays; byId: Map<string, Site>;
  mapFiltered: boolean; retrievedAt: string; scenario: boolean;
  onDays: (days: OutlookDays) => void; onMapFilter: (enabled: boolean) => void;
  onSelect: (id: string) => void;
};

export function OutlookPanel({ result, days, byId, mapFiltered, retrievedAt, scenario, onDays, onMapFilter, onSelect }: Props) {
  const title = (id: string) => byId.get(id)?.title ?? id;
  const period = (p: ProjectEvidence) => `${p.start === null ? 'Unknown start' : formatDay(p.start)} – ${p.end === null ? 'unknown end' : formatDay(p.end)}`;
  return (
    <section className="block" aria-labelledby="outlook-title">
      <h3 id="outlook-title">Construction Outlook</h3>
      <p className="muted">Published schedules{scenario ? ' with your scenario changes' : ''}; no traffic forecast.</p>
      <div className="segmented" role="group" aria-label="Construction outlook period">
        {([7, 14, 30] as const).map((n) => (
          <button key={n} type="button" aria-pressed={days === n} className={days === n ? 'selected' : ''} onClick={() => onDays(n)}>Next {n} days</button>
        ))}
      </div>
      <p>{dayRange(result.from, result.to)} · inclusive, Europe/Berlin calendar</p>
      <label className="outlook-filter"><input type="checkbox" checked={mapFiltered} onChange={(e) => onMapFilter(e.target.checked)} /> Show this period on the map and timeline</label>
      <dl className="facts" aria-label="Projects in the outlook period">
        <dt>Starting in period</dt><dd>{result.starting.length}</dd>
        <dt>Already ongoing</dt><dd>{result.ongoing.length}</dd>
        <dt>Ending in period</dt><dd>{result.ending.length}</dd>
      </dl>
      <p className="muted small">Open-ended schedules may still be active; they are marked uncertain. Selected project context remains visible on the map.</p>
      <details>
        <summary>Projects overlapping period ({result.active.length})</summary>
        <ul className="plain analytics-list">
          {result.active.map((p) => (
            <li key={p.id}>
              <button className="link-button" onClick={() => onSelect(p.id)}>{title(p.id)}</button>
              <div className="muted small">{period(p)}{p.end === null ? ' · uncertain schedule' : ''}</div>
            </li>
          ))}
        </ul>
        {!result.active.length && <p className="muted">No dated projects overlap this period.</p>}
      </details>
      <details>
        <summary>Potential Construction Conflicts ({result.conflicts.length})</summary>
        <p className="muted small">Reported footprints touch/intersect or are within 250 m, and verified dates overlap. Proximity does not prove a traffic disruption.</p>
        <ul className="plain analytics-list">
          {result.conflicts.map((c) => (
            <li key={`${c.a}:${c.b}`}>
              <button className="link-button" onClick={() => onSelect(c.a)}>{title(c.a)}</button> / <button className="link-button" onClick={() => onSelect(c.b)}>{title(c.b)}</button>
              <div className="muted small">{c.intersects ? 'Footprints touch or intersect' : `Footprints about ${metres(c.metres)} apart`} · {dayRange(c.from, c.to)}</div>
            </li>
          ))}
        </ul>
      </details>
      {!!result.uncertain.length && (
        <details>
          <summary>Uncertain schedules ({result.uncertain.length})</summary>
          <p className="muted small">Some may be included above; undated work is not counted as newly starting. No conflicts are asserted without both dates.</p>
          <ul className="plain analytics-list">{result.uncertain.map((p) => <li key={p.id}><button className="link-button" onClick={() => onSelect(p.id)}>{title(p.id)}</button><div className="muted small">{period(p)}</div></li>)}</ul>
        </details>
      )}
      <p className="muted small source-note">Source: do.move read-only construction data, from Dortmund Open Data. Retrieved {new Date(retrievedAt).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })} (Berlin). Source update time is not supplied by this endpoint; published plans may be incomplete.</p>
    </section>
  );
}
