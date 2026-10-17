import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useData } from './data/useData';
import type { Dataset } from './data/useData';
import {
  adviseClusters, bestWindows, clusterConflicts, dailyLoad, findConflicts, isActive, priorities, programmeBalance, stopsUnderPressure,
  todoList, transitGaps,
} from './model/analysis';
import type { DayRange } from './model/analysis';
import { formatDay, formatShort, isoDay, localToday, toDay } from './model/days';
import { bboxOf, shapeOf, toLonLat, toXY } from './model/geo';
import type { BBox, LonLat } from './model/geo';
import { applyShifts, changeCount, EMPTY_SCENARIO, hypotheticalInput, isEmpty, scenarioCsv } from './model/scenario';
import type { HypotheticalSite, Shift } from './model/scenario';
import { buildSites, findNeighbours, nearestRoad, prepareContext } from './model/sites';
import { CoordinateTab } from './ui/CoordinateTab';
import { plural } from './ui/format';
import { MapView } from './ui/MapView';
import type { MapFocus, MapLink, MapOverlay, MapPoi } from './ui/MapView';
import { PrioritiesTab } from './ui/PrioritiesTab';
import { RoutesTab } from './ui/RoutesTab';
import { SitePanel } from './ui/SitePanel';
import { Summary } from './ui/Summary';
import type { Stat } from './ui/Summary';
import { useTheme } from './ui/theme';
import { Timeline } from './ui/Timeline';
import { TodoTab } from './ui/TodoTab';
import { TransitTab } from './ui/TransitTab';
import { useScenario } from './ui/useScenario';

type Tab = 'todo' | 'coordinate' | 'priorities' | 'transit' | 'routes';
const TABS: [Tab, string][] = [['todo', 'To do'], ['coordinate', 'Coordinate'], ['priorities', 'Priorities'], ['transit', 'Transit'], ['routes', 'Routes']];
const BACK = 30;
const AHEAD = 365;

export default function App() {
  const [today] = useState(localToday);
  const { state, retry } = useData(today);
  if (state.status === 'loading') return <Splash loading><p>Loading Dortmund's construction sites and open data…</p></Splash>;
  if (state.status === 'failed') {
    return <Splash><p role="alert">{state.message}</p><button className="button primary" onClick={retry}>Try again</button></Splash>;
  }
  return <Planner data={state.data} problems={state.problems} today={today} />;
}

function Splash({ children, loading }: { children: ReactNode; loading?: boolean }) {
  return <main className={loading ? 'splash loading' : 'splash'}><img src="/domovelogo.png" alt="do.move" width={240} />{children}</main>;
}

const toBounds = (boxes: BBox[]): MapFocus['bounds'] => {
  const [minX, minY, maxX, maxY] = bboxOf(boxes.flatMap((b) => [[b[0], b[1]], [b[2], b[3]]] as [number, number][]));
  return [...toLonLat([minX, minY]), ...toLonLat([maxX, maxY])] as MapFocus['bounds'];
};

function Planner({ data, problems, today }: { data: Dataset; problems: string[]; today: number }) {
  const theme = useTheme();
  const [scenario, setScenario] = useScenario();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<Tab>('todo');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [pick, setPick] = useState<{ hint: string; done: (at: LonLat) => void } | null>(null);
  const [draft, setDraft] = useState<LonLat | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const panelBody = useRef<HTMLDivElement>(null);
  const from = today - BACK;
  const to = today + AHEAD;

  const ctx = useMemo(() => prepareContext(data), [data]);
  const districtShapes = useMemo(() => data.districts.map((d) => ({ name: d.name, shape: shapeOf(d.geometry) })), [data.districts]);
  const baseSites = useMemo(
    () => buildSites([...data.raw, ...scenario.added.map((h) => hypotheticalInput(h, districtShapes))], ctx),
    [data.raw, scenario.added, districtShapes, ctx],
  );
  const neighbours = useMemo(() => findNeighbours(baseSites), [baseSites]);
  const sites = useMemo(() => applyShifts(baseSites, scenario.shifts), [baseSites, scenario.shifts]);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const published = useMemo(() => baseSites.filter((s) => !s.hypothetical), [baseSites]);
  const horizon = useMemo(() => {
    const planned = published.filter((s) => s.status === 'planned' && s.baseStart <= s.baseEnd);
    return planned.length ? Math.max(...planned.map((s) => s.baseStart)) : null;
  }, [published]);
  const holidays = useMemo(() => data.holidays.map((h) => ({ start: toDay(h.start), end: toDay(h.end), name: h.name })), [data.holidays]);
  const holidayRanges = useMemo(() => holidays.map((h): DayRange => [h.start, h.end]), [holidays]);

  const load = useMemo(() => dailyLoad(sites, from, to), [sites, from, to]);
  const publishedLoad = useMemo(() => (isEmpty(scenario) ? null : dailyLoad(published, from, to)), [scenario, published, from, to]);
  const conflicts = useMemo(() => findConflicts(sites, neighbours, today, to), [sites, neighbours, today, to]);
  const publishedConflicts = useMemo(() => findConflicts(published, neighbours, today, to), [published, neighbours, today, to]);
  const clusters = useMemo(() => clusterConflicts(conflicts), [conflicts]);
  const bundles = useMemo(() => conflicts.filter((c) => c.type === 'bundle'), [conflicts]);
  const advice = useMemo(
    () => adviseClusters(clusters, byId, sites, neighbours, holidayRanges, today, horizon),
    [clusters, byId, sites, neighbours, holidayRanges, today, horizon],
  );
  const ranked = useMemo(() => priorities(sites, neighbours, date), [sites, neighbours, date]);
  const gaps = useMemo(() => transitGaps(sites, data.residents, date), [sites, data.residents, date]);
  const pressure = useMemo(() => stopsUnderPressure(sites, data.stops, date), [sites, data.stops, date]);
  const todo = useMemo(() => todoList(clusters, advice, bundles, byId, gaps, today), [clusters, advice, bundles, byId, gaps, today]);
  const balance = useMemo(
    () => (data.programme.length ? programmeBalance(data.programme, data.districts.map((d) => d.name)) : null),
    [data.programme, data.districts],
  );

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedConflicts = useMemo(() => (selected ? conflicts.filter((c) => c.a === selected.id || c.b === selected.id) : []), [selected, conflicts]);
  const siteAdvice = useMemo(() => (
    selected && (selected.hypothetical || selected.baseStart > today)
      ? bestWindows(selected, sites, neighbours.get(selected.id) ?? [], holidayRanges, today, horizon)
      : null
  ), [selected, sites, neighbours, holidayRanges, today, horizon]);

  useEffect(() => {
    panelBody.current?.scrollTo({ top: 0 });
  }, [tab, selectedId]);

  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPick(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  const selectSite = (id: string) => {
    const s = byId.get(id);
    if (!s) return;
    setSelectedId(id);
    setFocus({ bounds: toBounds([s.shape.bbox]) });
  };
  const selectCluster = (id: string | null) => {
    setClusterId(id);
    const c = id && clusters.find((x) => x.id === id);
    if (c) setFocus({ bounds: toBounds(c.siteIds.map((sid) => byId.get(sid)!.shape.bbox)) });
  };
  const selectDistrict = (name: string | null) => {
    setDistrict(name);
    const d = name && districtShapes.find((x) => x.name === name);
    if (d) setFocus({ bounds: toBounds([d.shape.bbox]) });
  };
  const showOverlay = (o: MapOverlay | null) => {
    setOverlay(o);
    const pts = [...(o?.normal ?? []), ...(o?.aware ?? []), ...(o?.ends ?? [])];
    const ring = o?.reach ? (o.reach.type === 'Polygon' ? o.reach.coordinates[0] : o.reach.coordinates.flatMap((p) => p[0])) : [];
    const all = [...pts, ...(ring as LonLat[])];
    if (all.length > 1) setFocus({ bounds: toBounds([bboxOf(all.map(toXY))]) });
  };
  const switchTab = (id: Tab) => {
    setTab(id);
    setSelectedId(null);
    // frame what the tab is about: the ranked sites, or the whole city for the district comparison
    const boxes = id === 'priorities' ? ranked.slice(0, 10).map((p) => p.site.shape.bbox) : id === 'transit' ? districtShapes.map((d) => d.shape.bbox) : [];
    if (boxes.length) setFocus({ bounds: toBounds(boxes) });
  };
  const setShift = (id: string, shift: Shift | null) => {
    const shifts = { ...scenario.shifts };
    if (shift) shifts[id] = shift;
    else delete shifts[id];
    setScenario({ ...scenario, shifts });
  };
  const addProject = (h: Omit<HypotheticalSite, 'id'>) => {
    const id = `p${Date.now().toString(36)}`;
    setScenario({ ...scenario, added: [...scenario.added, { ...h, id }] });
    setDraft(null);
    setSelectedId(id);
  };
  const removeProject = (id: string) => {
    const shifts = { ...scenario.shifts };
    delete shifts[id];
    setScenario({ shifts, added: scenario.added.filter((h) => h.id !== id) });
    setSelectedId(null);
  };

  // what the map shows besides the sites depends on the tab
  const highlight = useMemo(() => {
    if (selected) return [selected.id, ...selectedConflicts.map((c) => (c.a === selected.id ? c.b : c.a))];
    const c = tab === 'coordinate' && clusterId ? clusters.find((x) => x.id === clusterId) : undefined;
    return c ? c.siteIds : [];
  }, [selected, selectedConflicts, tab, clusterId, clusters]);
  const links = useMemo((): MapLink[] => {
    const cluster = tab === 'coordinate' && clusterId ? clusters.find((x) => x.id === clusterId) : undefined;
    const list = selected ? selectedConflicts : cluster ? cluster.conflicts : tab === 'coordinate' ? bundles : [];
    return list.flatMap((c) => {
      const [a, b] = [byId.get(c.a), byId.get(c.b)];
      return a && b ? [{ from: a.center, to: b.center, type: c.type }] : [];
    });
  }, [selected, selectedConflicts, tab, clusterId, clusters, bundles, byId]);
  const ranks = useMemo(() => {
    if (tab === 'priorities') return new Map(ranked.slice(0, 10).map((p, i) => [p.site.id, i + 1]));
    if (tab !== 'todo') return null;
    // the To do list's numbers, on the site each item is about
    const numbers = new Map<string, number>();
    todo.forEach((t, i) => {
      const id = t.kind === 'align' ? t.second.id : t.kind === 'transit' ? null : t.site.id;
      if (id && !numbers.has(id)) numbers.set(id, i + 1);
    });
    return numbers;
  }, [tab, ranked, todo]);
  const districtValues = useMemo(() => (tab === 'transit'
    ? data.districts.map((d) => ({ name: d.name, geometry: d.geometry, value: gaps.find((g) => g.district === d.name)?.score ?? 0 }))
    : []), [tab, data.districts, gaps]);
  const pois = useMemo((): MapPoi[] => {
    const as = (kind: MapPoi['kind'], list: typeof data.stops) => list.map((p) => ({ kind, name: p.name, detail: p.detail, at: p.at }));
    if (tab === 'transit') return [...as('stop', data.stops), ...as('bike', data.bikes), ...as('pr', data.parkRide)];
    if (tab === 'routes') return [...as('fire', data.fire), ...as('hospital', data.hospitals)];
    return [];
  }, [tab, data]);
  const active = useMemo(() => sites.filter((s) => isActive(s, date)), [sites, date]);
  const districtsWithResidents = useMemo(
    () => data.districts.map((d) => ({ geometry: d.geometry, residents: data.residents.get(d.name) ?? 0 })),
    [data.districts, data.residents],
  );

  const stats = useMemo((): Stat[] => {
    const at = load[date - from];
    const window = load.slice(Math.max(0, date - from - 15), date - from + 16).map((p) => p.total).sort((a, b) => a - b);
    const vsUsual = at.total / (window[Math.floor(window.length / 2)] || 1) - 1;
    return [
      {
        value: String(active.length), label: 'active sites',
        about: `${active.filter((s) => s.kind === 'full').length} full closures, ${active.filter((s) => s.road === 'main').length} on main roads`,
      },
      {
        value: String(Math.round(at.total)), label: 'disruption points',
        about: '1 point = a full closure on a main road; lighter restrictions and side streets count less. Usual = the middle value of the month around this day.',
        note: Math.abs(vsUsual) < 0.05
          ? { text: 'about usual' }
          : { text: `${Math.round(Math.abs(vsUsual) * 100)} % ${vsUsual > 0 ? 'above' : 'below'} usual`, tone: vsUsual > 0 ? 'bad' : 'good' },
      },
      { value: String(clusters.length), label: 'clashes ahead', about: 'Groups of serious works within 400 m of each other running at the same time, over the coming year' },
    ];
  }, [load, date, from, clusters, active]);
  // the scenario against the published plans, in things a planner can count
  const publishedClusters = useMemo(() => clusterConflicts(publishedConflicts).length, [publishedConflicts]);
  const busiest = (pts: typeof load) => Math.round(Math.max(...pts.slice(BACK).map((p) => p.total)));

  const changes = changeCount(scenario);
  const orphaned = Object.keys(scenario.shifts).filter((id) => !byId.has(id)).length;
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => window.prompt('Copy this link to share the scenario:', window.location.href),
    );
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([scenarioCsv(scenario, sites)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `domove-scenario-${isoDay(today)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clampDate = (d: number) => Math.min(to, Math.max(from, d));
  const near = draft ? nearestRoad(draft, ctx) : null;
  const draftPlace = draft ? (near && near.m <= 40 ? `On ${near.name}` : `At ${draft[1].toFixed(4)}° N, ${draft[0].toFixed(4)}° E`) : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="/domovelogo.png" alt="do.move" /><span>Planner</span><span className="muted">Dortmund</span></div>
        <div className="date-control" aria-label="Day shown">
          <button className="icon-button" aria-label="One week earlier" onClick={() => setDate(clampDate(date - 7))}>‹</button>
          <span className="date-value">{formatDay(date)}{date === today ? ' · today' : ''}</span>
          <button className="icon-button" aria-label="One week later" onClick={() => setDate(clampDate(date + 7))}>›</button>
          {date !== today && <button className="link-button" onClick={() => setDate(today)}>Today</button>}
        </div>
        <Summary items={stats} />
        <div className="scenario">
          {changes ? (
            <>
              <strong>{plural(changes, 'change')}</strong>
              {publishedLoad && (
                <span className="muted" title="Published plans → your scenario">
                  clashes {publishedClusters} → {clusters.length} · busiest day {busiest(publishedLoad)} → {busiest(load)} points
                </span>
              )}
              {orphaned > 0 && <span className="note">{orphaned} no longer in the feed</span>}
              <button className="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
              <button className="button" onClick={exportCsv}>Export CSV</button>
              <button className="button" onClick={() => { setScenario(EMPTY_SCENARIO); setSelectedId(null); }}>Reset</button>
            </>
          ) : <span className="muted">No changes yet</span>}
        </div>
        {problems.length > 0 && <div className="banner" role="status">Some layers couldn't load ({problems.join('; ')}). Everything else works.</div>}
      </header>
      <div className="workspace">
        <section className="map-area">
          <MapView
            theme={theme} sites={sites} date={date} selectedId={selectedId} highlightIds={highlight} ranks={ranks} links={links}
            districts={districtValues} selectedDistrict={tab === 'transit' ? district : null} pois={pois}
            overlay={tab === 'routes' ? overlay : null} focus={focus} picking={!!pick}
            onPick={(at) => { pick?.done(at); setPick(null); }}
            onSelectSite={selectSite}
            onSelectDistrict={(name) => tab === 'transit' && selectDistrict(name)}
          />
          {pick && (
            <div className="pick-hint" role="status">
              {pick.hint} <button className="button" onClick={() => setPick(null)}>Cancel</button>
            </div>
          )}
          <Legend tab={tab} date={date} />
        </section>
        <aside className="panel">
          <nav className="tabs" role="tablist" aria-label="Planning views"
            style={{ '--tab': TABS.findIndex(([id]) => id === tab), '--tabs': TABS.length } as CSSProperties}>
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab selected' : 'tab'}
                onClick={() => switchTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="panel-body" ref={panelBody}>
            {selected && (
              <SitePanel
                key={selected.id} site={selected} byId={byId} conflicts={selectedConflicts} advice={siteAdvice} shift={scenario.shifts[selected.id]} date={date} today={today}
                priority={(() => { const i = ranked.findIndex((p) => p.site.id === selected.id); return i >= 0 ? { rank: i + 1, of: ranked.length, p: ranked[i] } : null; })()}
                onShift={(s) => setShift(selected.id, s)} onSelect={selectSite} onBack={() => setSelectedId(null)} onRemove={() => removeProject(selected.id)}
              />
            )}
            <div hidden={!!selected || tab !== 'todo'}>
              <TodoTab todo={todo} horizon={horizon} onSelectSite={selectSite} onShift={setShift}
                onOpenDistrict={(name) => { switchTab('transit'); selectDistrict(name); }} />
            </div>
            <div hidden={!!selected || tab !== 'coordinate'}>
              <CoordinateTab
                byId={byId} clusters={clusters} advice={advice} bundles={bundles} today={today} horizon={horizon}
                selectedCluster={clusterId} onSelectCluster={selectCluster} onSelectSite={selectSite} onShift={setShift} balance={balance}
                draft={draft} draftPlace={draftPlace}
                onPlace={() => setPick({ hint: 'Click where the works will be', done: setDraft })}
                onAdd={addProject} onCancelDraft={() => setDraft(null)}
              />
            </div>
            <div hidden={!!selected || tab !== 'priorities'}>
              <PrioritiesTab priorities={ranked} date={date} onSelectSite={selectSite} />
            </div>
            <div hidden={!!selected || tab !== 'transit'}>
              <TransitTab gaps={gaps} pressure={pressure} bikes={data.bikes} parkRide={data.parkRide} date={date} residentsYear={data.residentsYear}
                selected={district} onSelect={selectDistrict} onSelectSite={selectSite} />
            </div>
            <div hidden={!!selected || tab !== 'routes'}>
              <RoutesTab active={active} date={date} fire={data.fire} hospitals={data.hospitals} parkRide={data.parkRide} districts={districtsWithResidents}
                onOverlay={showOverlay} onPick={(hint, done) => setPick({ hint, done })} onSelectSite={selectSite} />
            </div>
          </div>
        </aside>
      </div>
      <Timeline load={load} published={publishedLoad} holidays={holidays} today={today} date={date} horizon={horizon} onDate={setDate} />
      <footer className="footer muted">
        Data: Stadt Dortmund open data · OpenHolidays · Routing: Valhalla (FOSSGIS) · Map © OpenStreetMap contributors, OpenFreeMap
      </footer>
    </div>
  );
}

function Legend({ tab, date }: { tab: Tab; date: number }) {
  // folded on phones, where it would cover half the map
  const [open] = useState(() => !window.matchMedia('(max-width: 960px)').matches);
  return (
    <details className="legend" open={open}>
      <summary className="legend-title">Sites on {formatShort(date)}</summary>
      <div className="legend-row"><i className="swatch high" />High disruption</div>
      <div className="legend-row"><i className="swatch medium" />Medium</div>
      <div className="legend-row"><i className="swatch low" />Low</div>
      <div className="legend-row"><i className="swatch later" />Starts within 30 days</div>
      {tab === 'coordinate' && (
        <>
          <div className="legend-row"><i className="key-line ink" />Running at the same time</div>
          <div className="legend-row"><i className="key-line bundle" />Same stretch: do together</div>
        </>
      )}
      {tab === 'todo' && <div className="legend-row"><span className="glyph">1</span>To do item</div>}
      {tab === 'priorities' && <div className="legend-row"><span className="glyph">1</span>Rank to speed up</div>}
      {tab === 'transit' && (
        <>
          <div className="legend-row"><i className="ramp" />Transit need per resident</div>
          <div className="legend-row"><span className="glyph">U</span>Stadtbahn · <span className="glyph">B</span>Bike share · <span className="glyph">P</span>P+R</div>
        </>
      )}
      {tab === 'routes' && (
        <>
          <div className="legend-row"><i className="key-line normal" />Normal route</div>
          <div className="legend-row"><i className="key-line aware" />Around the works</div>
          <div className="legend-row"><i className="swatch lost" />Reach lost to works</div>
          <div className="legend-row"><span className="glyph">F</span>Fire &amp; rescue · <span className="glyph">H</span>Hospital</div>
        </>
      )}
    </details>
  );
}
