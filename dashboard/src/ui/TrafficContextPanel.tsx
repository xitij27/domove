import { useStrings } from '../i18n';
import type { ProjectEvidence } from '../model/outlook';
import type { TrafficContext } from '../model/trafficContext';
import type { Site } from '../model/sites';
import { dayRange, metres } from './format';
import { Info } from './Info';
import { SiteLink } from './SiteName';
import { useSettings } from './useSettings';

export function TrafficContextPanel({ context, evidence, byId, onSelect, scenario = false }: {
  context: TrafficContext | null; evidence: ProjectEvidence | undefined;
  byId: Map<string, Site>; onSelect: (id: string) => void;
  scenario?: boolean;
}) {
  const cfg = useSettings();
  const t = useStrings().traffic;
  return (
    <section className="block project-analytics" aria-labelledby="traffic-context-title">
      <h3 id="traffic-context-title">{t.title}</h3>
      <Info>{t.info}</Info>
      {scenario && <p className="note">{t.scenario}</p>}
      {!context ? <p className="muted">{t.none}</p> : (
        <>
          <dl className="facts">
            <dt>{t.road}</dt><dd>{context.road ?? t.unknownRoad}</dd>
            <dt>{t.stops(metres(cfg['stop.radius']))}</dt><dd>{context.stopsKnown ? context.stops.length : t.stopsUnknown}</dd>
            <dt>{t.concurrent}</dt><dd>{evidence?.shape && evidence.start !== null && evidence.end !== null ? t.concurrentCount(context.nearby.length, metres(cfg['impact.radius'])) : t.concurrentUnknown}</dd>
          </dl>
          {!!context.stops.length && <ul className="plain analytics-list">{context.stops.map((s, i) => (
            <li key={`${s.name}:${i}`}>{t.stop(s.name, metres(s.m), s.detail)}</li>
          ))}</ul>}
          {!!context.nearby.length && <ul className="plain analytics-list">{context.nearby.map((p) => (
            <li key={p.id}>{byId.has(p.id) ? <SiteLink site={byId.get(p.id)!} onSelect={onSelect} /> : <button className="link-button" onClick={() => onSelect(p.id)}>{p.id}</button>}<div className="muted small">{t.between(metres(p.metres), dayRange(p.from, p.to))}</div></li>
          ))}</ul>}
          <details>
            <summary>{t.sources}</summary>
            <ul className="plain small">{context.sources.map((s) => <li key={s}>{s}</li>)}</ul>
            <ul className="plain muted small">{[...context.limitations, ...(evidence?.issues ?? [])].map((s) => <li key={s}>{s}</li>)}</ul>
          </details>
        </>
      )}
    </section>
  );
}
