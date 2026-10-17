import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useData } from './data/useData';
import type { Dataset } from './data/useData';
import type { Poi } from './data/sources';
import {
  adviseClusters, bestWindows, clusterConflicts, dailyLoad, findConflicts, isActive, priorities, programmeBalance, stopsUnderPressure, todoList,
  transitGaps,
} from './model/analysis';
import type { DayRange } from './model/analysis';
import { formatDay, formatShort, isoDay, toDay } from './model/days';
import { berlinToday, buildEvidence, outlook, potentialConflicts, validLonLat } from './model/outlook';
import { impactAssessment } from './model/impact';
import type { ImpactTarget } from './model/impact';
import type { OutlookDays } from './model/outlook';
import { bboxOf, shapeOf, toLonLat, toXY } from './model/geo';
import type { BBox, LonLat } from './model/geo';
import { DEFAULT_PARAMS, laneKm, LOAD_SCALE, roadKm, simulate } from './model/capacity';
import { applyShifts, changeCount, EMPTY_SCENARIO, hypotheticalInput, scenarioCsv } from './model/scenario';
import type { HypotheticalSite, Shift } from './model/scenario';
import { DEFAULT_SETTINGS } from './model/settings';
import type { Band, SettingKey, Settings } from './model/settings';
import { buildSites, findNeighbours, nearestRoad, prepareContext, weigh } from './model/sites';
import { CapacityTab } from './ui/CapacityTab';
import { CoordinateTab } from './ui/CoordinateTab';
import { Derived } from './ui/Derived';
import { dayRange, metres, num, one, plural, signed } from './ui/format';
import { OutlookPanel } from './ui/OutlookPanel';
import { trafficContext } from './model/trafficContext';
import { TrafficContextPanel } from './ui/TrafficContextPanel';
import { ImpactScorePanel } from './ui/ImpactScorePanel';
import { MapView } from './ui/MapView';
import type { ImpactView, MapFocus, MapLink, MapOverlay, MapPoi } from './ui/MapView';
import { PrioritiesTab } from './ui/PrioritiesTab';
import { RoutesTab } from './ui/RoutesTab';
import { SettingsPanel } from './ui/SettingsPanel';
import { SitePanel } from './ui/SitePanel';
import { Summary } from './ui/Summary';
import type { Stat } from './ui/Summary';
import { setThemePreference, useTheme } from './ui/theme';
import { Timeline } from './ui/Timeline';
import { TodoTab } from './ui/TodoTab';
import { TransitTab } from './ui/TransitTab';
import { useScenario } from './ui/useScenario';
import { SettingsContext } from './ui/useSettings';

type Tab = 'todo' | 'coordinate' | 'priorities' | 'transit' | 'capacity' | 'routes';
const IMPACT_VIEWS: [ImpactView, string][] = [['bands', 'Bands'], ['heat', 'Heat']];
const TABS: [Tab, string][] = [['todo', 'To do'], ['coordinate', 'Coordinate'], ['priorities', 'Priorities'], ['transit', 'Transit'], ['capacity', 'Capacity'], ['routes', 'Routes']];
const BACK = 30;
const AHEAD = 365;

export default function App() {
  const [today] = useState(berlinToday);
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
  const [outlookDays, setOutlookDays] = useState<OutlookDays>(7);
  const [outlookMap, setOutlookMap] = useState(true);
  const [impactTarget, setImpactTarget] = useState<ImpactTarget>('public');
  const [businessLocations, setBusinessLocations] = useState<Poi[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('todo');
  const [impactView, setImpactView] = useState<ImpactView>('bands');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const builtSites = useMemo(
    () => buildSites([...data.raw, ...scenario.added.map((h) => hypotheticalInput(h, districtShapes))], ctx),
    [data.raw, scenario.added, districtShapes, ctx],
  );
  // the planner's settings over the defaults; deferred so a slider stays smooth while everything recomputes behind it
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...scenario.settings }), [scenario.settings]);
  const cfg = useDeferredValue(settings);
  const baseSites = useMemo(() => weigh(builtSites, cfg), [builtSites, cfg]);
  const neighbours = useMemo(() => findNeighbours(builtSites), [builtSites]);
  const sites = useMemo(() => applyShifts(baseSites, scenario.shifts), [baseSites, scenario.shifts]);
  const evidence = useMemo(() => buildEvidence([
    ...data.raw, ...scenario.added.map((h) => hypotheticalInput(h, districtShapes)),
  ], sites), [data.raw, scenario.added, districtShapes, sites]);
  const analyticsConflicts = useMemo(() => potentialConflicts(evidence), [evidence]);
  const outlookResult = useMemo(() => outlook(evidence, date, outlookDays, 250, analyticsConflicts), [evidence, date, outlookDays, analyticsConflicts]);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const published = useMemo(() => baseSites.filter((s) => !s.hypothetical), [baseSites]);
  const horizon = useMemo(() => {
    const planned = published.filter((s) => s.status === 'planned' && s.baseStart <= s.baseEnd);
    return planned.length ? Math.max(...planned.map((s) => s.baseStart)) : null;
  }, [published]);
  const holidays = useMemo(() => data.holidays.map((h) => ({ start: toDay(h.start), end: toDay(h.end), name: h.name })), [data.holidays]);
  const holidayRanges = useMemo(() => holidays.map((h): DayRange => [h.start, h.end]), [holidays]);

  const load = useMemo(() => dailyLoad(sites, from, to), [sites, from, to]);
  // the published plans under the same settings, so the comparison shows only what the moves and new projects change
  const publishedLoad = useMemo(() => (changeCount(scenario) ? dailyLoad(published, from, to) : null), [scenario, published, from, to]);
  const conflicts = useMemo(() => findConflicts(sites, neighbours, today, to, cfg), [sites, neighbours, today, to, cfg]);
  const publishedConflicts = useMemo(() => findConflicts(published, neighbours, today, to, cfg), [published, neighbours, today, to, cfg]);
  const clusters = useMemo(() => clusterConflicts(conflicts, cfg), [conflicts, cfg]);
  const bundles = useMemo(() => conflicts.filter((c) => c.type === 'bundle'), [conflicts]);
  const advice = useMemo(
    () => adviseClusters(clusters, byId, sites, neighbours, holidayRanges, today, horizon, cfg),
    [clusters, byId, sites, neighbours, holidayRanges, today, horizon, cfg],
  );
  const ranked = useMemo(() => priorities(sites, neighbours, date, cfg), [sites, neighbours, date, cfg]);
  const districtRoadKm = useMemo(() => roadKm(data.roads, districtShapes), [data.roads, districtShapes]);
  const roadLaneKm = useMemo(() => laneKm(districtRoadKm, cfg), [districtRoadKm, cfg]);
  const [capacityParams, setCapacityParams] = useState(DEFAULT_PARAMS);
  const capacityResult = useMemo(
    () => simulate(sites, roadLaneKm, data.residents, date, capacityParams, cfg),
    [sites, roadLaneKm, data.residents, date, capacityParams, cfg],
  );
  const gaps = useMemo(() => transitGaps(sites, data.residents, date, cfg), [sites, data.residents, date, cfg]);
  const pressure = useMemo(() => stopsUnderPressure(sites, data.stops, date, cfg), [sites, data.stops, date, cfg]);
  const todo = useMemo(() => todoList(clusters, advice, bundles, byId, gaps, today), [clusters, advice, bundles, byId, gaps, today]);
  const balance = useMemo(
    () => (data.programme.length ? programmeBalance(data.programme, data.districts.map((d) => d.name), cfg) : null),
    [data.programme, data.districts, cfg],
  );

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedEvidence = evidence.find((p) => p.id === selectedId);
  const assessment = useMemo(() => selected && selectedEvidence ? impactAssessment(selected, selectedEvidence,
    evidence, analyticsConflicts, impactTarget === 'public' ? data.analytics.publicLocations : businessLocations, impactTarget) : null,
  [selected, selectedEvidence, evidence, analyticsConflicts, impactTarget, data.analytics.publicLocations, businessLocations]);
  const selectedTraffic = useMemo(() => selected && selectedEvidence ? trafficContext(selected, selectedEvidence,
    data.analytics.stopsAvailable ? data.stops : null, data.analytics.roadsAvailable, analyticsConflicts) : null,
  [selected, selectedEvidence, data, analyticsConflicts]);
  const selectedConflicts = useMemo(() => (selected ? conflicts.filter((c) => c.a === selected.id || c.b === selected.id) : []), [selected, conflicts]);
  const siteAdvice = useMemo(() => (
    selected && (selected.hypothetical || selected.baseStart > today)
      ? bestWindows(selected, sites, neighbours.get(selected.id) ?? [], holidayRanges, today, horizon, cfg)
      : null
  ), [selected, sites, neighbours, holidayRanges, today, horizon, cfg]);

  useEffect(() => {
    panelBody.current?.scrollTo({ top: 0 });
  }, [tab, selectedId, settingsOpen]);

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
    setSettingsOpen(false);
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
    setSettingsOpen(false);
    // frame what the tab is about: the ranked sites, or the whole city for the district comparison
    const boxes = id === 'priorities' ? ranked.slice(0, 10).map((p) => p.site.shape.bbox) : id === 'transit' || id === 'capacity' ? districtShapes.map((d) => d.shape.bbox) : [];
    if (boxes.length) setFocus({ bounds: toBounds(boxes) });
  };
  // a setting back at its default leaves the scenario, so the link stays short and the count says what really differs
  const setSetting = (key: SettingKey, value: number) => {
    const next: Partial<Settings> = { ...scenario.settings, [key]: value };
    if (value === DEFAULT_SETTINGS[key]) delete next[key];
    setScenario({ ...scenario, settings: next });
  };
  const settingsChanged = Object.keys(scenario.settings).length;
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
    setScenario({ ...scenario, shifts, added: scenario.added.filter((h) => h.id !== id) });
    setSelectedId(null);
  };

  // what the map shows besides the sites depends on the tab
  const highlight = useMemo(() => {
    if (selected) return [selected.id, ...selectedConflicts.map((c) => (c.a === selected.id ? c.b : c.a))];
    const c = tab === 'coordinate' && clusterId ? clusters.find((x) => x.id === clusterId) : undefined;
    return c ? c.siteIds : [];
  }, [selected, selectedConflicts, tab, clusterId, clusters]);
  const outlookPeriod = tab === 'coordinate' && outlookMap ? { from: outlookResult.from, to: outlookResult.to } : null;
  const mapSites = useMemo(() => {
    if (tab !== 'coordinate' || !outlookMap) return sites;
    const ids = new Set([...outlookResult.active.map((p) => p.id), ...highlight]);
    return sites.filter((s) => ids.has(s.id));
  }, [tab, outlookMap, sites, outlookResult.active, highlight]);
  const links = useMemo((): MapLink[] => {
    const cluster = tab === 'coordinate' && clusterId ? clusters.find((x) => x.id === clusterId) : undefined;
    const list = selected ? selectedConflicts : cluster ? cluster.conflicts : tab === 'coordinate' ? bundles : [];
    const displayedIds = new Set(mapSites.map((s) => s.id));
    return list.flatMap((c) => {
      if (!displayedIds.has(c.a) || !displayedIds.has(c.b)) return [];
      const [a, b] = [byId.get(c.a), byId.get(c.b)];
      return a && b ? [{ from: a.center, to: b.center, type: c.type }] : [];
    });
  }, [selected, selectedConflicts, tab, clusterId, clusters, bundles, byId, mapSites]);
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
  const districtValues = useMemo(() => {
    if (tab === 'transit') return data.districts.map((d) => ({ name: d.name, geometry: d.geometry, value: gaps.find((g) => g.district === d.name)?.score ?? 0 }));
    if (tab === 'capacity') return data.districts.map((d) => ({ name: d.name, geometry: d.geometry, value: capacityResult.districts.find((r) => r.district === d.name)?.load ?? null }));
    return [];
  }, [tab, data.districts, gaps, capacityResult]);
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
    const month = load.slice(Math.max(0, date - from - 15), date - from + 16);
    const usual = month.map((p) => p.total).sort((a, b) => a - b)[Math.floor(month.length / 2)];
    const vsUsual = at.total / (usual || 1) - 1;
    const inBand = (b: Band) => plural(active.filter((s) => s.band === b).length, 'site');
    return [
      {
        value: String(active.length), label: 'active sites',
        how: [
          ['Counted', `every site whose dates include ${formatDay(date)}`],
          ['Full closures', String(active.filter((s) => s.kind === 'full').length)],
          ['On main roads', String(active.filter((s) => s.road === 'main').length)],
        ],
      },
      {
        value: String(Math.round(at.total)), label: 'disruption points',
        how: [
          ['1 point', 'a full closure on a main road; each site counts its severity, restriction weight × road weight'],
          ['High', `${inBand('high')} of severity ${num(cfg['band.high'])}+: ${one(at.high)}`],
          ['Medium', `${inBand('medium')} of ${num(cfg['band.medium'])}–${num(cfg['band.high'])}: ${one(at.medium)}`],
          ['Low', `${inBand('low')} below ${num(cfg['band.medium'])}: ${one(at.low)}`],
          ['Usual', `${one(usual)}: the middle of the daily totals ${dayRange(month[0].day, month[month.length - 1].day)}`],
          ['Against usual', `${one(at.total)} ÷ ${one(usual)} − 1 = ${signed(vsUsual)}; within 5% counts as usual`],
        ],
        note: Math.abs(vsUsual) < 0.05
          ? { text: 'about usual' }
          : { text: `${Math.round(Math.abs(vsUsual) * 100)} % ${vsUsual > 0 ? 'above' : 'below'} usual`, tone: vsUsual > 0 ? 'bad' : 'good' },
      },
      {
        value: String(clusters.length), label: 'clashes ahead',
        how: [
          ['Clash', `works of severity ${num(cfg['cluster.minSeverity'])}+ within ${metres(cfg['cluster.radius'])} of each other on the same days, linked into groups`],
          ['Looking at', dayRange(today, to)],
          ['In them', `${plural(new Set(clusters.flatMap((c) => c.siteIds)).size, 'site')}, ${plural(clusters.reduce((n, c) => n + c.conflicts.length, 0), 'overlapping pair')}`],
        ],
      },
    ];
  }, [load, date, from, clusters, active, today, to, cfg]);
  // the scenario against the published plans, in things a planner can count
  const publishedClusters = useMemo(() => clusterConflicts(publishedConflicts, cfg).length, [publishedConflicts, cfg]);
  const busiest = (pts: typeof load) => pts.slice(BACK).reduce((a, b) => (b.total > a.total ? b : a));

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
    <SettingsContext value={cfg}>
    <div className="app">
      <header className="topbar">
        <div className="header-main">
          <div className="brand">
            <img src="/domovelogo.png" alt="do.move" />
            <span className="beta" title="Early version: the weights behind the figures are judgement calls">Beta</span>
          </div>
          <div className="date-control" aria-label="Day shown">
            <button className="icon-button" aria-label="One week earlier" onClick={() => setDate(clampDate(date - 7))}>‹</button>
            <span className="date-value">{formatDay(date)}{date === today ? ' · today' : ''}</span>
            <button className="icon-button" aria-label="One week later" onClick={() => setDate(clampDate(date + 7))}>›</button>
            {date !== today && <button className="link-button" onClick={() => setDate(today)}>Today</button>}
          </div>
          <div className="header-tools">
            <div className="theme-choice" role="group" aria-label="Colour theme">
              <button type="button" aria-label="Light mode" title="Light mode" aria-pressed={theme === 'light'} onClick={() => setThemePreference('light')}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </button>
              <button type="button" aria-label="Dark mode" title="Dark mode" aria-pressed={theme === 'dark'} onClick={() => setThemePreference('dark')}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
                </svg>
              </button>
            </div>
            <button
              type="button" className="settings-button" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}
              aria-label={settingsChanged ? `Settings, ${plural(settingsChanged, 'setting')} changed` : 'Settings'}
              title={settingsChanged ? `Settings: ${plural(settingsChanged, 'setting')} changed` : 'Settings'}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {settingsChanged > 0 && <span className="settings-count" aria-hidden="true">{settingsChanged}</span>}
            </button>
          </div>
        </div>
        <div className="header-context">
          <Summary items={stats} />
          <div className="scenario">
            {changes || settingsChanged ? (
              <>
                <div className="scenario-details">
                  {changes > 0 && <strong>{plural(changes, 'change')}</strong>}
                  {publishedLoad && (
                    <span className="muted">
                      <Derived how={[
                        ['Published plans', `${plural(publishedClusters, 'clash', 'clashes')}; busiest day ${formatShort(busiest(publishedLoad).day)}, ${one(busiest(publishedLoad).total)} points`],
                        ['Your scenario', `${plural(clusters.length, 'clash', 'clashes')}; busiest day ${formatShort(busiest(load).day)}, ${one(busiest(load).total)} points`],
                        ['Busiest day', `of ${dayRange(today, to)}`],
                      ]}>
                        clashes {publishedClusters} → {clusters.length} · busiest day {Math.round(busiest(publishedLoad).total)} → {Math.round(busiest(load).total)} points
                      </Derived>
                    </span>
                  )}
                  {orphaned > 0 && <span className="note">{orphaned} no longer in the feed</span>}
                </div>
                <div className="scenario-actions">
                  <button className="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
                  <button className="button" onClick={exportCsv}>Export CSV</button>
                  <button className="button" onClick={() => { setScenario(EMPTY_SCENARIO); setSelectedId(null); }}>Reset</button>
                </div>
              </>
            ) : <span className="muted">No changes yet</span>}
          </div>
        </div>
        {problems.length > 0 && <div className="banner" role="status">Some layers couldn't load ({problems.join('; ')}). Everything else works.</div>}
      </header>
      <div className="workspace">
        <section className="map-area">
          <MapView
            theme={theme} impactView={impactView} sites={mapSites} date={date} selectedId={selectedId} highlightIds={highlight} ranks={ranks} links={links}
            outlookProjects={outlookPeriod ? outlookResult.active : undefined}
            districts={districtValues} districtMax={tab === 'capacity' ? LOAD_SCALE : undefined} selectedDistrict={tab === 'transit' || tab === 'capacity' ? district : null} pois={pois}
            overlay={tab === 'routes' ? overlay : null} focus={focus} picking={!!pick}
            onPick={(at) => { pick?.done(at); setPick(null); }}
            onSelectSite={selectSite}
            onSelectDistrict={(name) => (tab === 'transit' || tab === 'capacity') && selectDistrict(name)}
          />
          {pick && (
            <div className="pick-hint" role="status">
              {pick.hint} <button className="button" onClick={() => setPick(null)}>Cancel</button>
            </div>
          )}
          <div className="map-tool" role="group" aria-label="Colour the works by">
            {IMPACT_VIEWS.map(([id, label]) => (
              <button key={id} className={impactView === id ? 'selected' : ''} aria-pressed={impactView === id} onClick={() => setImpactView(id)}>{label}</button>
            ))}
          </div>
          <Legend tab={tab} date={date} impactView={impactView} outlookPeriod={outlookPeriod} />
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
            {settingsOpen && (
              <SettingsPanel settings={settings} changed={settingsChanged} onChange={setSetting}
                onReset={() => setScenario({ ...scenario, settings: {} })} onBack={() => setSettingsOpen(false)} />
            )}
            {selected && !settingsOpen && (
              <>
              <SitePanel
                key={selected.id} site={selected} byId={byId} conflicts={selectedConflicts} advice={siteAdvice} shift={scenario.shifts[selected.id]} date={date} today={today}
                priority={(() => { const i = ranked.findIndex((p) => p.site.id === selected.id); return i >= 0 ? { rank: i + 1, of: ranked.length, p: ranked[i] } : null; })()}
                onShift={(s) => setShift(selected.id, s)} onSelect={selectSite} onBack={() => setSelectedId(null)} onRemove={() => removeProject(selected.id)}
              />
              <ImpactScorePanel assessment={assessment} target={impactTarget} locations={businessLocations} scenario={changeCount(scenario) > 0}
                locationError={locationError} onTarget={(target) => { setImpactTarget(target); setLocationError(null); }}
                onAdd={() => {
                  setLocationError(null);
                  setPick({ hint: 'Click a business location in Dortmund (Escape to cancel)', done: (at) => {
                    if (!validLonLat(at)) { setLocationError('Choose a location within the Dortmund study area.'); return; }
                    setBusinessLocations((items) => [...items, { name: `Business location ${items.length + 1}`, detail: 'Selected in this browser tab', district: '', at }]);
                  } });
                }}
                onRename={(index, name) => setBusinessLocations((items) => items.map((p, i) => i === index ? { ...p, name } : p))}
                onRemove={(index) => setBusinessLocations((items) => items.filter((_, i) => i !== index))} />
              <TrafficContextPanel context={selectedTraffic} evidence={selectedEvidence} byId={byId} onSelect={selectSite} scenario={changeCount(scenario) > 0} />
              </>
            )}
            <div hidden={!!selected || settingsOpen || tab !== 'todo'}>
              <TodoTab todo={todo} byId={byId} horizon={horizon} onSelectSite={selectSite} onShift={setShift}
                onOpenDistrict={(name) => { switchTab('transit'); selectDistrict(name); }} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'coordinate'}>
              <OutlookPanel result={outlookResult} days={outlookDays} byId={byId} mapFiltered={outlookMap}
                retrievedAt={data.retrievedAt} scenario={changeCount(scenario) > 0} onSelect={selectSite}
                onDays={(days) => { setOutlookDays(days); setOutlookMap(true); }} onMapFilter={setOutlookMap} />
              <CoordinateTab
                byId={byId} clusters={clusters} advice={advice} bundles={bundles} today={today} horizon={horizon}
                selectedCluster={clusterId} onSelectCluster={selectCluster} onSelectSite={selectSite} onShift={setShift} balance={balance}
                draft={draft} draftPlace={draftPlace}
                onPlace={() => setPick({ hint: 'Click where the works will be', done: setDraft })}
                onAdd={addProject} onCancelDraft={() => setDraft(null)}
              />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'priorities'}>
              <PrioritiesTab priorities={ranked} date={date} onSelectSite={selectSite} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'capacity'}>
              <CapacityTab result={capacityResult} params={capacityParams} date={date} selected={district} onParams={setCapacityParams}
                onSelect={selectDistrict} onSelectSite={selectSite} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'transit'}>
              <TransitTab gaps={gaps} pressure={pressure} bikes={data.bikes} parkRide={data.parkRide} date={date} residentsYear={data.residentsYear}
                selected={district} onSelect={selectDistrict} onSelectSite={selectSite} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'routes'}>
              <RoutesTab active={active} date={date} fire={data.fire} hospitals={data.hospitals} parkRide={data.parkRide} districts={districtsWithResidents}
                onOverlay={showOverlay} onPick={(hint, done) => setPick({ hint, done })} onSelectSite={selectSite} />
            </div>
          </div>
        </aside>
      </div>
      <Timeline load={load} published={publishedLoad} holidays={holidays} today={today} date={date} horizon={horizon} onDate={setDate} outlookPeriod={outlookPeriod} />
      <footer className="footer muted">
        Data: Stadt Dortmund open data · OpenHolidays · Routing: Valhalla (FOSSGIS) · Map © OpenStreetMap contributors, OpenFreeMap
      </footer>
    </div>
    </SettingsContext>
  );
}

function Legend({ tab, date, impactView, outlookPeriod }: { tab: Tab; date: number; impactView: ImpactView; outlookPeriod: { from: number; to: number } | null }) {
  // folded on phones, where it would cover half the map
  const [open] = useState(() => !window.matchMedia('(max-width: 960px)').matches);
  return (
    <details className="legend" open={open}>
      <summary className="legend-title">{outlookPeriod ? `Outlook ${formatShort(outlookPeriod.from)} – ${formatShort(outlookPeriod.to)}` : `Sites on ${formatShort(date)}`}</summary>
      {impactView === 'bands' ? (
        <>
          <div className="legend-row"><i className="swatch high" />High disruption</div>
          <div className="legend-row"><i className="swatch medium" />Medium</div>
          <div className="legend-row"><i className="swatch low" />Low</div>
        </>
      ) : (
        <div className="legend-row"><i className="ramp impact" />Disruption heat (zoom in for sites)</div>
      )}
      <div className="legend-row"><i className="swatch later" />{outlookPeriod ? 'Starts within selected period' : 'Starts within 30 days'}</div>
      {tab === 'coordinate' && (
        <>
          <div className="legend-row"><i className="key-line ink" />Running at the same time</div>
          <div className="legend-row"><i className="key-line bundle" />Same stretch: do together</div>
        </>
      )}
      {tab === 'todo' && <div className="legend-row"><span className="glyph">1</span>Matches the number in the To do list</div>}
      {tab === 'priorities' && <div className="legend-row"><span className="glyph">1</span>Priority rank (1 = finish first)</div>}
      {tab === 'capacity' && <div className="legend-row"><i className="ramp" />Road load: 0 → 125% (top colour = full)</div>}
      {(tab === 'capacity' || tab === 'transit') && <div className="legend-row"><i className="key-line selection" />Chosen district</div>}
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
