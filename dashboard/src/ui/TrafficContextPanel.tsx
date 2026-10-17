import type { ProjectEvidence } from '../model/outlook';
import type { TrafficContext } from '../model/trafficContext';
import type { Site } from '../model/sites';
import { dayRange, metres } from './format';

export function TrafficContextPanel({ context, evidence, byId, onSelect }: {
  context: TrafficContext | null; evidence: ProjectEvidence | undefined;
  byId: Map<string, Site>; onSelect: (id: string) => void;
}) {
  return (
    <section className="block project-analytics" aria-labelledby="traffic-context-title">
      <h3 id="traffic-context-title">Traffic Context</h3>
      {!context ? <p className="muted">No separate verified assessment is available for this project representation.</p> : (
        <>
          <dl className="facts">
            <dt>Mapped road</dt><dd>{context.road ?? 'Unknown / unavailable'}</dd>
            <dt>Stops within 500 m</dt><dd>{context.stops.length}</dd>
            <dt>Concurrent projects</dt><dd>{context.nearby.length} potential conflicts within 250 m</dd>
          </dl>
          <p className="muted small">Distances use the published construction footprint. Concurrent projects use full reported periods, independently of the selected outlook window. Missing footprints or dates may hide further relationships.</p>
          {!!context.stops.length && <ul className="plain analytics-list">{context.stops.map((s, i) => (
            <li key={`${s.name}:${i}`}>{s.name} · about {metres(s.m)}{s.detail ? ` · ${s.detail}` : ''}</li>
          ))}</ul>}
          {!!context.nearby.length && <ul className="plain analytics-list">{context.nearby.map((p) => (
            <li key={p.id}><button className="link-button" onClick={() => onSelect(p.id)}>{byId.get(p.id)?.title ?? p.id}</button><div className="muted small">About {metres(p.metres)} between footprints · {dayRange(p.from, p.to)}</div></li>
          ))}</ul>}
          <details>
            <summary>Sources and limitations</summary>
            <ul className="plain small">{context.sources.map((s) => <li key={s}>{s}</li>)}</ul>
            <ul className="plain muted small">{[...context.limitations, ...(evidence?.issues ?? [])].map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="muted small">The existing Routes tab can investigate a chosen trip. A verified project-specific alternative route is not available here.</p>
          </details>
        </>
      )}
    </section>
  );
}
