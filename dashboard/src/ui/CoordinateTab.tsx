import { useState } from 'react';
import type { Cluster, ClusterAdvice, Conflict, ProgrammeBalance } from '../model/analysis';
import type { ClosureKind } from '../model/closures';
import { formatShort, isoDay, toDay } from '../model/days';
import { PERIODS } from '../data/sources';
import type { PeriodKey, ProgrammeProject } from '../data/sources';
import { useStrings } from '../i18n';
import type { LonLat } from '../model/geo';
import type { HypotheticalSite, Shift } from '../model/scenario';
import type { Site } from '../model/sites';
import { Derived } from './Derived';
import { clashText, dayRange, metres, num, shiftText, shortTitle } from './format';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { alignWorking, finishWorking, moveWorking } from './working';

type Props = {
  byId: Map<string, Site>;
  clusters: Cluster[];
  advice: Map<string, ClusterAdvice | null>;
  bundles: Conflict[];
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

const PROJECT_KINDS: ClosureKind[] = ['full', 'half', 'narrowing', 'signal', 'one_way', 'sidewalk'];

function ClusterCard({ cluster, advice, open, byId, onToggle, onSelectSite, onApply }: {
  cluster: Cluster; advice: ClusterAdvice | null; open: boolean; byId: Map<string, Site>;
  onToggle: () => void; onSelectSite: (id: string) => void; onApply: () => void;
}) {
  const cfg = useSettings();
  const t = useStrings();
  const c = t.coordinate;
  const sites = cluster.siteIds.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => b.severity - a.severity);
  const districts = [...new Set(sites.map((s) => s.district).filter(Boolean))].join(', ');
  return (
    <li className={open ? 'card open' : 'card'}>
      <button className="card-head" onClick={onToggle} aria-pressed={open} title={c.showOnMap}>
        <strong>{districts || 'Dortmund'}</strong>
        <span className="muted">{c.clusterMeta(sites.length, dayRange(cluster.from, cluster.to))}</span>
      </button>
      {advice?.option ? (
        <div className="suggestion">
          <span>
            {c.start(<strong>{shortTitle(advice.site.title)}</strong>, shiftText(advice.option.shift))}
            <span className="muted small">
              {c.moveDetail(dayRange(advice.option.start, advice.option.end),
                <Derived how={moveWorking(advice.site, advice.current, advice.option, cfg)}>{clashText(advice.current)} → {clashText(advice.option)}</Derived>)}
            </span>
          </span>
          <button className="button" onClick={onApply}>{c.apply}</button>
        </div>
      ) : advice ? (
        <div className="suggestion muted">
          <span>
            <Derived how={finishWorking(advice.site, sites.filter((s) => s.id !== advice.site.id))}>{c.noMove}</Derived>
            {c.askFinish(<strong>{shortTitle(advice.site.title)}</strong>, formatShort(advice.site.end))}
          </span>
        </div>
      ) : null}
      <ul className="plain sites">
        {sites.map((s) => (
          <li key={s.id}><button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button> <span className="muted">{t.kinds[s.kind]}</span></li>
        ))}
      </ul>
    </li>
  );
}

function ProjectForm({ place, today, onAdd, onCancel }: { place: string; today: number; onAdd: Props['onAdd']; onCancel: () => void }) {
  const t = useStrings();
  const c = t.coordinate;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ClosureKind>('full');
  const [radius, setRadius] = useState(40);
  const [days, setDays] = useState(30);
  const [start, setStart] = useState(isoDay(today + 14));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start) && toDay(start) >= today && days >= 1 && days <= 365;
  return (
    <form className="project-form" onSubmit={(e) => {
      e.preventDefault();
      if (valid) onAdd({ name: name.trim() || c.proposedWorks, kind, center: [0, 0], radius, start: toDay(start), days });
    }}>
      <p className="muted">{place}</p>
      <label>{c.name}<input value={name} maxLength={120} placeholder={c.proposedWorks} onChange={(e) => setName(e.target.value)} /></label>
      <label>{c.restriction}
        <select value={kind} onChange={(e) => setKind(e.target.value as ClosureKind)}>
          {PROJECT_KINDS.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>{c.size}
          <select value={radius} onChange={(e) => setRadius(+e.target.value)}>
            <option value={20}>{c.small}</option><option value={40}>{c.medium}</option><option value={80}>{c.large}</option>
          </select>
        </label>
        <label>{c.duration}<input type="number" min={1} max={365} value={days} onChange={(e) => setDays(+e.target.value)} /></label>
      </div>
      <label>{c.earliestStart}<input type="date" min={isoDay(today)} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <div className="form-row">
        <button className="button primary" type="submit" disabled={!valid}>{c.addProject}</button>
        <button className="button" type="button" onClick={onCancel}>{c.cancel}</button>
      </div>
    </form>
  );
}

function ProgrammeGrid({ balance }: { balance: ProgrammeBalance }) {
  const cfg = useSettings();
  const c = useStrings().coordinate;
  const [cell, setCell] = useState<{ district: string; period: PeriodKey } | null>(null);
  const max = Math.max(1, ...balance.rows.flatMap((r) => PERIODS.map(([k]) => balance.cells.get(r)![k].count)));
  const picked = cell ? balance.cells.get(cell.district)![cell.period] : null;
  const projects: ProgrammeProject[] = picked
    ? [...picked.projects].sort((a, b) =>
        Number(a.status === 'im Bau') - Number(b.status === 'im Bau') || a.points - b.points)
    : [];
  // the feed's "überörtlich", which the data layer calls Citywide
  const district = (name: string) => (name === 'Citywide' ? c.citywide : name);
  return (
    <>
      <div className="heat-wrap">
        <table className="heat">
          <thead><tr><th scope="col">{c.district}</th>{PERIODS.map(([k]) => <th scope="col" key={k}>{c.periods[k]}</th>)}</tr></thead>
          <tbody>
            {balance.rows.map((r) => (
              <tr key={r}>
                <th scope="row">{district(r)}</th>
                {PERIODS.map(([k]) => {
                  const counts = balance.cells.get(r)![k];
                  const step = counts.count ? Math.min(4, Math.ceil((counts.count / max) * 5) - 1) : -1;
                  const selected = cell?.district === r && cell.period === k;
                  return (
                    <td key={k}>
                      <button
                        className={`heat-cell${step >= 0 ? ` heat-${step}` : ''}${selected ? ' selected' : ''}`}
                        aria-label={c.cell(district(r), c.periods[k], counts.count, counts.overloaded)}
                        aria-pressed={selected}
                        disabled={!counts.count}
                        onClick={() => setCell(selected ? null : { district: r, period: k })}
                      >
                        {counts.count || ''}{counts.overloaded && <span className="overload" aria-hidden="true">▲</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell && (
        <div className="block">
          <h4>{c.deferral(district(cell.district), c.periods[cell.period])}</h4>
          <p className="muted small">
            <Derived how={[
              [c.middleDistrict, c.middleHow(balance.medians[cell.period])],
              [c.overloaded, c.overloadedHow(cfg['overload.min'], num(cfg['overload.factor']), picked!.overloaded)],
            ]}>
              {c.inConstruction(picked!.count)}{picked!.overloaded ? ' ▲' : ''}
            </Derived>
          </p>
          <ul className="plain">
            {projects.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                <div className="muted">
                  {c.project(p.trade, p.priorityClass, p.points)}{p.status ? ` · ${p.status}` : ''}
                  {p.mainRoad ? c.mainRoad : ''}{p.transit ? c.transit : ''}
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
  const cfg = useSettings();
  const c = useStrings().coordinate;
  const { byId, clusters, advice, bundles, today, horizon } = props;
  return (
    <div className="tab-body">
      <section className="block">
        <h3>{c.clashes} <span className="count">{clusters.length}</span></h3>
        <Info>{c.clashesInfo(metres(cfg['cluster.radius']), metres(cfg['clash.radius']), horizon !== null ? formatShort(horizon) : null)}</Info>
        {clusters.length === 0 && <p className="ok">{c.noClashes(metres(cfg['cluster.radius']))}</p>}
        <ul className="cards">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              advice={advice.get(cluster.id) ?? null}
              open={props.selectedCluster === cluster.id}
              byId={byId}
              onToggle={() => props.onSelectCluster(props.selectedCluster === cluster.id ? null : cluster.id)}
              onSelectSite={props.onSelectSite}
              onApply={() => {
                const a = advice.get(cluster.id);
                if (a?.option) props.onShift(a.site.id, [a.option.shift, a.option.shift]);
              }}
            />
          ))}
        </ul>
      </section>

      <section className="block">
        <h3>{c.together} <span className="count">{bundles.length}</span></h3>
        <Info>{c.togetherInfo}</Info>
        {bundles.length === 0 && <p className="muted">{c.noTogether(cfg['together.maxGap'])}</p>}
        <ul className="cards">
          {bundles.map((b) => {
            const [first, second] = [byId.get(b.a)!, byId.get(b.b)!].sort((x, y) => x.start - y.start);
            if (!first || !second) return null;
            const target = Math.max(today + 1, first.start);
            return (
              <li className="card" key={`${b.a}-${b.b}`}>
                <div><button className="link-button" title={first.title} onClick={() => props.onSelectSite(first.id)}>{shortTitle(first.title)}</button> <span className="muted">{first.owner}</span></div>
                <div><button className="link-button" title={second.title} onClick={() => props.onSelectSite(second.id)}>{shortTitle(second.title)}</button> <span className="muted">{second.owner}</span></div>
                <div className="suggestion">
                  <span><Derived how={alignWorking(first, second, target, cfg)}>{c.sameStreet(b.days)}</Derived>{c.startSecond(formatShort(target))}</span>
                  <button className="button" onClick={() => props.onShift(second.id, [target - second.baseStart, target - second.baseStart])}>{c.align}</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="block">
        <h3>{c.newProject}</h3>
        {props.draft ? (
          <ProjectForm place={props.draftPlace} today={today} onAdd={(h) => props.onAdd({ ...h, center: props.draft! })} onCancel={props.onCancelDraft} />
        ) : (
          <>
            <p className="muted">{c.newProjectHint}</p>
            <button className="button primary" onClick={props.onPlace}>{c.place}</button>
          </>
        )}
      </section>

      <section className="block">
        <h3>{c.programme}</h3>
        <Info>{c.programmeInfo(<span aria-hidden="true">▲</span>, cfg['overload.min'], num(cfg['overload.factor']))}</Info>
        {props.balance ? <ProgrammeGrid balance={props.balance} /> : <p className="muted">{c.programmeFailed}</p>}
      </section>
    </div>
  );
}
