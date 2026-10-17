import { useMemo, useState } from 'react';
import type { Cluster, Conflict, DayRange, ProgrammeBalance, WindowOption } from '../model/analysis';
import { bestWindows } from '../model/analysis';
import { KIND_LABEL } from '../model/closures';
import type { ClosureKind } from '../model/closures';
import { formatShort, isoDay, toDay } from '../model/days';
import { PERIODS } from '../data/sources';
import type { PeriodKey, ProgrammeProject } from '../data/sources';
import type { LonLat } from '../model/geo';
import type { HypotheticalSite, Shift } from '../model/scenario';
import type { Neighbour, Site } from '../model/sites';
import { dayRange, metres, plural, signedDays, signedPct } from './format';

type Props = {
  sites: Site[];
  byId: Map<string, Site>;
  neighbours: Map<string, Neighbour[]>;
  clusters: Cluster[];
  bundles: Conflict[];
  holidays: DayRange[];
  today: number;
  horizon: number | null;
  selectedCluster: string | null;
  onSelectCluster: (id: string | null) => void;
  onSelectSite: (id: string) => void;
  onShift: (id: string, shift: Shift) => void;
  balance: ProgrammeBalance | null;
  draft: LonLat | null;
  draftPlace: string;
  onPlace: () => void;
  onAdd: (h: Omit<HypotheticalSite, 'id'>) => void;
  onCancelDraft: () => void;
};

type Suggestion = { site: Site; option: WindowOption; current: WindowOption } | { site: Site; option: null };

const PROJECT_KINDS: ClosureKind[] = ['full', 'half', 'narrowing', 'signal', 'one_way', 'sidewalk'];

function ClusterCard({ cluster, suggestion, open, byId, onToggle, onSelectSite, onApply }: {
  cluster: Cluster; suggestion: Suggestion | null; open: boolean; byId: Map<string, Site>;
  onToggle: () => void; onSelectSite: (id: string) => void; onApply: () => void;
}) {
  const sites = cluster.siteIds.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => b.severity - a.severity);
  const districts = [...new Set(sites.map((s) => s.district).filter(Boolean))].join(', ');
  const shown = open ? sites : sites.slice(0, 3);
  return (
    <li className={open ? 'card open' : 'card'}>
      <button className="card-head" onClick={onToggle} aria-expanded={open}>
        <strong>{districts || 'Dortmund'}</strong>
        <span className="muted">{plural(sites.length, 'site')} · {dayRange(cluster.from, cluster.to)}</span>
      </button>
      <ul className="plain">
        {shown.map((s) => (
          <li key={s.id}><button className="link-button" onClick={() => onSelectSite(s.id)}>{s.title}</button> <span className="muted">{KIND_LABEL[s.kind]}</span></li>
        ))}
        {!open && sites.length > 3 && <li className="muted">and {sites.length - 3} more</li>}
      </ul>
      {suggestion?.option ? (
        <div className="suggestion">
          <span>
            Move <strong>{suggestion.site.title.split(' - ')[0]}</strong> to {dayRange(suggestion.option.start, suggestion.option.end)} ({signedDays(suggestion.option.shift)})
            {suggestion.current.overlap > 0 ? `: its overlap ${signedPct((suggestion.option.overlap - suggestion.current.overlap) / suggestion.current.overlap)}` : ''}
          </span>
          <button className="button" onClick={onApply}>Apply</button>
        </div>
      ) : suggestion ? (
        <div className="suggestion muted">
          <span>
            No single move within three months clears this. Finishing <strong>{suggestion.site.title.split(' - ')[0]}</strong> (until {formatShort(suggestion.site.end)}) sooner helps most.
          </span>
        </div>
      ) : null}
    </li>
  );
}

function ProjectForm({ place, today, onAdd, onCancel }: { place: string; today: number; onAdd: Props['onAdd']; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClosureKind>('full');
  const [radius, setRadius] = useState(40);
  const [days, setDays] = useState(30);
  const [start, setStart] = useState(isoDay(today + 14));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start) && toDay(start) >= today && days >= 1 && days <= 365;
  return (
    <form className="project-form" onSubmit={(e) => {
      e.preventDefault();
      if (valid) onAdd({ name: name.trim() || 'Proposed works', kind, center: [0, 0], radius, start: toDay(start), days });
    }}>
      <p className="muted">{place}</p>
      <label>Name<input value={name} maxLength={120} placeholder="Proposed works" onChange={(e) => setName(e.target.value)} /></label>
      <label>Restriction
        <select value={kind} onChange={(e) => setKind(e.target.value as ClosureKind)}>
          {PROJECT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>Size
          <select value={radius} onChange={(e) => setRadius(+e.target.value)}>
            <option value={20}>Small (20 m)</option><option value={40}>Medium (40 m)</option><option value={80}>Large (80 m)</option>
          </select>
        </label>
        <label>Duration (days)<input type="number" min={1} max={365} value={days} onChange={(e) => setDays(+e.target.value)} /></label>
      </div>
      <label>Earliest start<input type="date" min={isoDay(today)} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <div className="form-row">
        <button className="button primary" type="submit" disabled={!valid}>Add and find the best window</button>
        <button className="button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function ProgrammeGrid({ balance }: { balance: ProgrammeBalance }) {
  const [cell, setCell] = useState<{ district: string; period: PeriodKey } | null>(null);
  const max = Math.max(1, ...balance.rows.flatMap((r) => PERIODS.map(([k]) => balance.cells.get(r)![k].count)));
  const projects: ProgrammeProject[] = cell
    ? [...balance.cells.get(cell.district)![cell.period].projects].sort((a, b) =>
        Number(a.status === 'im Bau') - Number(b.status === 'im Bau') || a.points - b.points)
    : [];
  return (
    <>
      <div className="heat-wrap">
        <table className="heat">
          <thead><tr><th scope="col">District</th>{PERIODS.map(([k, label]) => <th scope="col" key={k}>{label}</th>)}</tr></thead>
          <tbody>
            {balance.rows.map((r) => (
              <tr key={r}>
                <th scope="row">{r}</th>
                {PERIODS.map(([k, label]) => {
                  const c = balance.cells.get(r)![k];
                  const step = c.count ? Math.min(4, Math.ceil((c.count / max) * 5) - 1) : -1;
                  const selected = cell?.district === r && cell.period === k;
                  return (
                    <td key={k}>
                      <button
                        className={`heat-cell${step >= 0 ? ` heat-${step}` : ''}${selected ? ' selected' : ''}`}
                        aria-label={`${r}, ${label}: ${plural(c.count, 'project')} in construction${c.overloaded ? ', overloaded' : ''}`}
                        aria-pressed={selected}
                        disabled={!c.count}
                        onClick={() => setCell(selected ? null : { district: r, period: k })}
                      >
                        {c.count || ''}{c.overloaded && <span className="overload" aria-hidden="true">▲</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Projects in the "Bau" stage per period: 2026 by quarter, the other years whole. <span aria-hidden="true">▲</span> marks a
        district with at least 1.5 times the period's median, a candidate for moving work to a quieter period.
      </p>
      {cell && (
        <div className="block">
          <h4>{cell.district}, {PERIODS.find(([k]) => k === cell.period)![1]}: deferral candidates first</h4>
          <ul className="plain">
            {projects.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                <div className="muted">
                  {p.trade || 'Works'} · priority class {p.priorityClass || '–'} · {p.points} points{p.status ? ` · ${p.status}` : ''}
                  {p.mainRoad ? ' · main-road traffic' : ''}{p.transit ? ' · ÖPNV' : ''}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function CoordinateTab(props: Props) {
  const { sites, byId, neighbours, clusters, bundles, holidays, today, horizon } = props;
  const [showAll, setShowAll] = useState(false);
  const suggestions = useMemo(() => new Map(clusters.slice(0, 30).map((c): [string, Suggestion | null] => {
    let best: (Suggestion & { gain: number }) | null = null;
    for (const s of c.siteIds.map((id) => byId.get(id)!).filter((s) => s && (s.hypothetical || s.baseStart > today))) {
      const advice = bestWindows(s, sites, neighbours.get(s.id) ?? [], holidays, today, horizon);
      // only a move that at least halves the site's overlap is worth asking an owner for
      const option = advice.options.find((o) => o.overlap <= 0.5 * advice.current.overlap);
      if (option && (!best || advice.current.cost - option.cost > best.gain)) best = { site: s, option, current: advice.current, gain: advice.current.cost - option.cost };
    }
    if (best) return [c.id, best];
    // otherwise the works that keep the cluster going longest are the ones to speed up
    const longest = c.siteIds.map((id) => byId.get(id)!).filter((s) => s && !s.hypothetical && s.baseStart <= today)
      .sort((a, b) => b.end - a.end || b.severity - a.severity)[0];
    return [c.id, longest ? { site: longest, option: null } : null];
  })), [clusters, byId, sites, neighbours, holidays, today, horizon]);
  const shown = showAll ? clusters : clusters.slice(0, 6);

  return (
    <div className="tab-body">
      <section className="block">
        <h3>Overlap clusters <span className="count">{clusters.length}</span></h3>
        <p className="muted">
          Serious works within 400 m of each other at the same time make each other's detours worse. Spread them out, so
          every neighbourhood keeps a way around.
        </p>
        {clusters.length === 0 && <p className="ok">No serious works overlap within 400 m of each other in the coming year.</p>}
        {horizon !== null && clusters.length > 0 && <p className="muted small">Suggestions know the works published up to {formatShort(horizon)}; later ones aren't announced yet.</p>}
        <ul className="cards">
          {shown.map((c) => (
            <ClusterCard
              key={c.id}
              cluster={c}
              suggestion={suggestions.get(c.id) ?? null}
              open={props.selectedCluster === c.id}
              byId={byId}
              onToggle={() => props.onSelectCluster(props.selectedCluster === c.id ? null : c.id)}
              onSelectSite={props.onSelectSite}
              onApply={() => {
                const s = suggestions.get(c.id);
                if (s?.option) props.onShift(s.site.id, [s.option.shift, s.option.shift]);
              }}
            />
          ))}
        </ul>
        {clusters.length > 6 && (
          <button className="link-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${clusters.length}`}</button>
        )}
      </section>

      <section className="block">
        <h3>Do these together <span className="count">{bundles.length}</span></h3>
        <p className="muted">Works on the same stretch at different times close the street twice. Aligning them spares residents the second closure.</p>
        {bundles.length === 0 && <p className="muted">No works on the same stretch follow each other within six months.</p>}
        <ul className="cards">
          {bundles.map((b) => {
            const [first, second] = [byId.get(b.a)!, byId.get(b.b)!].sort((x, y) => x.start - y.start);
            if (!first || !second) return null;
            const target = Math.max(today + 1, first.start);
            return (
              <li className="card" key={`${b.a}-${b.b}`}>
                <div><button className="link-button" onClick={() => props.onSelectSite(first.id)}>{first.title}</button> <span className="muted">{first.owner}</span></div>
                <div><button className="link-button" onClick={() => props.onSelectSite(second.id)}>{second.title}</button> <span className="muted">{second.owner}</span></div>
                <div className="suggestion">
                  <span>{metres(b.m)} apart, {plural(b.days, 'day')} between them. Start the second on {formatShort(target)}.</span>
                  <button className="button" onClick={() => props.onShift(second.id, [target - second.baseStart, target - second.baseStart])}>Align</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="block">
        <h3>Plan a new project</h3>
        {props.draft ? (
          <ProjectForm place={props.draftPlace} today={today} onAdd={(h) => props.onAdd({ ...h, center: props.draft! })} onCancel={props.onCancelDraft} />
        ) : (
          <>
            <p className="muted">Place planned works on the map and get the start dates that disturb least, given everything else that's planned.</p>
            <button className="button primary" onClick={props.onPlace}>Place on the map</button>
          </>
        )}
      </section>

      <section className="block">
        <h3>Works programme 2025–2028</h3>
        {props.balance ? <ProgrammeGrid balance={props.balance} /> : <p className="muted">The Tiefbauamt's works programme couldn't be loaded.</p>}
      </section>
    </div>
  );
}
