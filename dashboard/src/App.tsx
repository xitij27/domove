import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useData } from './data/useData';
import type { Dataset } from './data/useData';
import { fetchTransitLines } from './data/sources';
import type { Poi, TransitFeature } from './data/sources';
import { useLanguage, useStrings } from './i18n';
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
import { blocksBlueLight } from './model/closures';
import { bboxOf, shapeOf, toLonLat, toXY } from './model/geo';
import { preparePopulation } from './model/population';
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
import { dayRange, metres, num, one } from './ui/format';
import { LanguageChoice } from './ui/LanguageChoice';
import { OutlookPanel } from './ui/OutlookPanel';
import { trafficContext } from './model/trafficContext';
import { TrafficContextPanel } from './ui/TrafficContextPanel';
import { ImpactScorePanel } from './ui/ImpactScorePanel';
import { MapView } from './ui/MapView';
import { MODES, saveMode, savedMode } from './ui/modes';
import type { Mode, StatKey, Tab } from './ui/modes';
import { ModeSwitch } from './ui/ModeSwitch';
import type { ImpactView, MapFocus, MapLink, MapOverlay, MapPoi } from './ui/MapView';
import { PrioritiesTab } from './ui/PrioritiesTab';
import { RoutesTab } from './ui/RoutesTab';
import { SettingsPanel } from './ui/SettingsPanel';
import { SitePanel } from './ui/SitePanel';
import { Summary } from './ui/Summary';
import type { Stat } from './ui/Summary';
import { useTheme } from './ui/theme';
import { ThemeToggle } from './ui/ThemeToggle';
import { Timeline } from './ui/Timeline';
import { TodoTab } from './ui/TodoTab';
import { TransitTab } from './ui/TransitTab';
import { PanelResizer } from './ui/PanelResizer';
import { savedWidth } from './ui/panelWidth';
import { saveTransitLayers, savedTransitLayers } from './ui/transitLayers';
import type { TransitLayer } from './ui/transitLayers';
import { TransitLayersCard } from './ui/TransitLayersCard';
import { useScenario } from './ui/useScenario';
import { SettingsContext } from './ui/useSettings';

const IMPACT_VIEWS: ImpactView[] = ['bands', 'heat'];
const BACK = 30;
const AHEAD = 365;

export default function App() {
  const t = useStrings();
  const [today] = useState(berlinToday);
  const { state, retry } = useData(today);
  if (state.status === 'loading') return <Splash loading><p>{t.app.loading}</p></Splash>;
  if (state.status === 'failed') {
    return <Splash><p role="alert">{state.message}</p><button className="button primary" onClick={retry}>{t.app.tryAgain}</button></Splash>;
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
  // the model's reasons and the figures' working are worked out in memos below, each given `t` so a new language redoes them
  const t = useStrings();
  const language = useLanguage();
  const [scenario, setScenario] = useScenario();
  const [date, setDate] = useState(today);
  const [panelWidth, setPanelWidth] = useState(savedWidth);
  const [outlookDays, setOutlookDays] = useState<OutlookDays>(7);
  const [outlookMap, setOutlookMap] = useState(true);
  const [impactTarget, setImpactTarget] = useState<ImpactTarget>('public');
  const [businessLocations, setBusinessLocations] = useState<Poi[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(savedMode);
  const [tab, setTab] = useState<Tab>(() => MODES[mode].tabs[0]);
  const [impactView, setImpactView] = useState<ImpactView>('bands');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [pick, setPick] = useState<{ hint: string; done: (at: LonLat) => void } | null>(null);
  const [draft, setDraft] = useState<LonLat | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [transitLayers, setTransitLayers] = useState(savedTransitLayers);
  const [transitLines, setTransitLines] = useState<TransitFeature[] | null>(null);
  const [transitFailed, setTransitFailed] = useState(false);
  const [lineFocus, setLineFocus] = useState<string | null>(null);
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
  ], sites, t), [data.raw, scenario.added, districtShapes, sites, t]);
  const analyticsConflicts = useMemo(() => potentialConflicts(evidence, cfg['impact.radius']), [evidence, cfg]);
  const outlookResult = useMemo(() => outlook(evidence, date, outlookDays, cfg['impact.radius'], analyticsConflicts), [evidence, date, outlookDays, analyticsConflicts, cfg]);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const published = useMemo(() => baseSites.filter((s) => !s.hypothetical), [baseSites]);
  const horizon = useMemo(() => {
    const planned = published.filter((s) => s.status === 'planned' && s.baseStart <= s.baseEnd);
    return planned.length ? Math.max(...planned.map((s) => s.baseStart)) : null;
  }, [published]);
  const holidays = useMemo(
    () => data.holidays.map((h) => ({ start: toDay(h.start), end: toDay(h.end), name: language === 'de' ? h.nameDe : h.name })),
    [data.holidays, language],
  );
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
  const ranked = useMemo(() => priorities(sites, neighbours, date, cfg, t), [sites, neighbours, date, cfg, t]);
  const districtRoadKm = useMemo(() => roadKm(data.roads, districtShapes), [data.roads, districtShapes]);
  const roadLaneKm = useMemo(() => laneKm(districtRoadKm, cfg), [districtRoadKm, cfg]);
  const [capacityParams, setCapacityParams] = useState(DEFAULT_PARAMS);
  const capacityResult = useMemo(
    () => simulate(sites, roadLaneKm, data.residents, date, capacityParams, cfg),
    [sites, roadLaneKm, data.residents, date, capacityParams, cfg],
  );
  const population = useMemo(() => (data.population ? preparePopulation(data.population) : null), [data.population]);
  const gaps = useMemo(() => transitGaps(sites, data.residents, population, date, cfg), [sites, data.residents, population, date, cfg]);
  const pressure = useMemo(() => stopsUnderPressure(sites, data.stops, date, cfg), [sites, data.stops, date, cfg]);
  const todo = useMemo(() => todoList(clusters, advice, bundles, byId, gaps, today), [clusters, advice, bundles, byId, gaps, today]);
  const balance = useMemo(
    () => (data.programme.length ? programmeBalance(data.programme, data.districts.map((d) => d.name), cfg) : null),
    [data.programme, data.districts, cfg],
  );

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedEvidence = evidence.find((p) => p.id === selectedId);
  const assessment = useMemo(() => selected && selectedEvidence ? impactAssessment(selected, selectedEvidence,
    evidence, analyticsConflicts, impactTarget === 'public' ? data.analytics.publicLocations : businessLocations, impactTarget, cfg, t) : null,
  [selected, selectedEvidence, evidence, analyticsConflicts, impactTarget, data.analytics.publicLocations, businessLocations, cfg, t]);
  const selectedTraffic = useMemo(() => selected && selectedEvidence ? trafficContext(selected, selectedEvidence,
    data.analytics.stopsAvailable ? data.stops : null, data.analytics.roadsAvailable, analyticsConflicts, cfg['stop.radius'], t) : null,
  [selected, selectedEvidence, data, analyticsConflicts, cfg, t]);
  const selectedConflicts = useMemo(() => (selected ? conflicts.filter((c) => c.a === selected.id || c.b === selected.id) : []), [selected, conflicts]);
  const siteAdvice = useMemo(() => (
    selected && (selected.hypothetical || selected.baseStart > today)
      ? bestWindows(selected, sites, neighbours.get(selected.id) ?? [], holidayRanges, today, horizon, cfg)
      : null
  ), [selected, sites, neighbours, holidayRanges, today, horizon, cfg]);

  useEffect(() => {
    if (mode !== 'transit' || transitLines) return;
    let live = true;
    fetchTransitLines().then((lines) => live && setTransitLines(lines), () => live && setTransitFailed(true));
    return () => { live = false; };
  }, [mode, transitLines]);

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
  const toggleTransit = (layer: TransitLayer) => {
    const next = { ...transitLayers, [layer]: !transitLayers[layer] };
    setTransitLayers(next);
    saveTransitLayers(next);
    if (layer === 'stadtbahn') setLineFocus(null);
  };
  // picking a Stadtbahn line frames its whole route
  const focusLine = (ref: string | null) => {
    setLineFocus(ref);
    const line = ref ? transitLines?.find((f) => f.properties.kind === 'stadtbahn' && f.properties.ref === ref) : undefined;
    if (!line) return;
    const points = line.geometry.type === 'LineString' ? line.geometry.coordinates : line.geometry.coordinates.flat();
    const lons = points.map((c) => c[0]);
    const lats = points.map((c) => c[1]);
    setFocus({ bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] });
  };
  const showOverlay = (o: MapOverlay | null) => {
    setOverlay(o);
    const pts = [...(o?.normal ?? []), ...(o?.aware ?? []), ...(o?.ends ?? [])];
    const ring = o?.reach ? (o.reach.type === 'Polygon' ? o.reach.coordinates[0] : o.reach.coordinates.flatMap((p) => p[0])) : [];
    const all = [...pts, ...(ring as LonLat[])];
    if (all.length > 1) setFocus({ bounds: toBounds([bboxOf(all.map(toXY))]) });
  };
  const switchMode = (next: Mode, view: Tab = MODES[next].tabs[0]) => {
    setMode(next);
    saveMode(next);
    setOverlay(null);
    setLineFocus(null);
    switchTab(view);
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
  const outlookPeriod = tab === 'outlook' && outlookMap ? { from: outlookResult.from, to: outlookResult.to } : null;
  const mapSites = useMemo(() => {
    if (tab !== 'outlook' || !outlookMap) return sites;
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
    todo.forEach((item, i) => {
      const id = item.kind === 'align' ? item.second.id : item.kind === 'transit' ? null : item.site.id;
      if (id && !numbers.has(id)) numbers.set(id, i + 1);
    });
    return numbers;
  }, [tab, ranked, todo]);
  const districtValues = useMemo(() => {
    if (tab === 'transit') return data.districts.map((d) => ({ name: d.name, geometry: d.geometry, value: gaps.find((g) => g.district === d.name)?.cutOff || null }));
    if (tab === 'capacity') return data.districts.map((d) => ({ name: d.name, geometry: d.geometry, value: capacityResult.districts.find((r) => r.district === d.name)?.load ?? null }));
    return [];
  }, [tab, data.districts, gaps, capacityResult]);
  // each role keeps its own places on the map, whichever view is open
  const pois = useMemo((): MapPoi[] => {
    const as = (kind: MapPoi['kind'], list: typeof data.stops) => list.map((p) => ({ kind, name: p.name, detail: p.detail, at: p.at }));
    if (mode === 'transit') {
      return [...(transitLayers.stop ? as('stop', data.stops) : []), ...(transitLayers.bike ? as('bike', data.bikes) : []), ...(transitLayers.pr ? as('pr', data.parkRide) : [])];
    }
    if (mode === 'emergency') return [...as('fire', data.fire), ...as('hospital', data.hospitals)];
    return [];
  }, [mode, data, transitLayers]);
  const mapTransit = useMemo(
    () => (mode === 'transit' && transitLines ? transitLines.filter((f) => transitLayers[f.properties.kind]) : []),
    [mode, transitLines, transitLayers],
  );
  const stadtbahnLines = useMemo(() => transitLines?.filter((f) => f.properties.kind === 'stadtbahn') ?? null, [transitLines]);
  const active = useMemo(() => sites.filter((s) => isActive(s, date)), [sites, date]);
  const districtsWithResidents = useMemo(
    () => data.districts.map((d) => ({ geometry: d.geometry, residents: data.residents.get(d.name) ?? 0 })),
    [data.districts, data.residents],
  );

  const statPool = useMemo((): Record<StatKey, Stat> => {
    const s = t.stats;
    const at = load[date - from];
    const inBand = (b: Band) => active.filter((site) => site.band === b).length;
    const closed = active.filter((site) => blocksBlueLight(site.kinds));
    return {
      active: {
        value: String(active.length), label: s.active,
        how: [
          [s.counted, s.countedHow(formatDay(date))],
          [s.fullClosures, String(closed.length)],
          [s.onMainRoads, String(active.filter((site) => site.road === 'main').length)],
        ],
      },
      closures: {
        value: String(closed.length), label: s.closures,
        how: [
          [s.counted, s.closuresHow(formatDay(date))],
          [s.onMainRoads, String(closed.filter((site) => site.road === 'main').length)],
        ],
      },
      stops: {
        value: String(pressure.length), label: s.stops,
        how: [
          [s.counted, s.stopsHow(num(cfg['stop.minSeverity']), metres(cfg['stop.radius']), cfg['transit.days'], formatDay(date))],
          ...(pressure.length ? [[s.mostHit, s.mostHitHow(pressure[0].stop.name, pressure[0].sites.length)] as [string, string]] : []),
        ],
      },
      points: {
        value: String(Math.round(at.total)), label: s.points,
        how: [
          [s.onePoint, s.onePointHow],
          [s.high, s.highHow(inBand('high'), num(cfg['band.high']), one(at.high))],
          [s.medium, s.mediumHow(inBand('medium'), num(cfg['band.medium']), num(cfg['band.high']), one(at.medium))],
          [s.low, s.lowHow(inBand('low'), num(cfg['band.medium']), one(at.low))],
          // shortcut: no "usual" until the dashboard keeps its own history of the feed (roadmap 4e); the feed forgets ended works
          [s.againstUsual, s.noUsualHow],
        ],
      },
      clashes: {
        value: String(clusters.length), label: s.clashes,
        how: [
          [s.clash, s.clashHow(num(cfg['cluster.minSeverity']), metres(cfg['cluster.radius']))],
          [s.lookingAt, dayRange(today, to)],
          [s.inThem, s.inThemHow(new Set(clusters.flatMap((c) => c.siteIds)).size, clusters.reduce((n, c) => n + c.conflicts.length, 0))],
        ],
      },
    };
  }, [load, date, from, clusters, active, pressure, today, to, cfg, t]);
  const stats = MODES[mode].stats.map((k) => statPool[k]);
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
      () => window.prompt(t.app.copyPrompt, window.location.href),
    );
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([scenarioCsv(scenario, sites, t)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `domove-scenario-${isoDay(today)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clampDate = (d: number) => Math.min(to, Math.max(from, d));
  const near = draft ? nearestRoad(draft, ctx) : null;
  const draftPlace = draft ? (near && near.m <= 40 ? t.app.onRoad(near.name) : t.app.at(draft[1].toFixed(4), draft[0].toFixed(4))) : '';

  return (
    <SettingsContext value={cfg}>
    <div className="app" data-mode={mode}>
      <header className="topbar">
        <div className="brand">
          <img src="/domovelogo.png" alt="do.move" />
          <span className="beta" title={t.app.betaTitle}>{t.app.beta}</span>
        </div>
        <ModeSwitch mode={mode} onMode={(m) => m !== mode && switchMode(m)} />
        <div className="header-tools">
          <LanguageChoice />
          <span className="tool-divider" aria-hidden="true" />
          <ThemeToggle />
          <span className="tool-divider" aria-hidden="true" />
          <button
            type="button" className="tool-button settings-button" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label={settingsChanged ? t.app.settingsChanged(settingsChanged) : t.app.settings}
            title={settingsChanged ? t.app.settingsChangedTitle(settingsChanged) : t.app.settings}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {settingsChanged > 0 && <span className="settings-count" aria-hidden="true">{settingsChanged}</span>}
          </button>
        </div>
        {problems.length > 0 && <div className="banner" role="status">{t.app.problems(problems.join('; '))}</div>}
      </header>
      <div className="workspace" style={{ '--panel-width': `${panelWidth}px` } as CSSProperties}>
        <section className="map-area">
          <MapView
            theme={theme} impactView={impactView} sites={mapSites} date={date} selectedId={selectedId} highlightIds={highlight} ranks={ranks} links={links}
            outlookProjects={outlookPeriod ? outlookResult.active : undefined}
            districts={districtValues} districtMax={tab === 'capacity' ? LOAD_SCALE : undefined} selectedDistrict={tab === 'transit' || tab === 'capacity' ? district : null} pois={pois}
            transit={mapTransit} lineFocus={lineFocus}
            overlay={tab === 'routes' ? overlay : null} focus={focus} picking={!!pick}
            onPick={(at) => { pick?.done(at); setPick(null); }}
            onSelectSite={selectSite}
            onSelectDistrict={(name) => (tab === 'transit' || tab === 'capacity') && selectDistrict(name)}
          />
          {pick && (
            <div className="pick-hint" role="status">
              {pick.hint} <button className="button" onClick={() => setPick(null)}>{t.app.cancel}</button>
            </div>
          )}
          <div className="map-tool" role="group" aria-label={t.app.colourBy}>
            {IMPACT_VIEWS.map((id) => (
              <button key={id} className={impactView === id ? 'selected' : ''} aria-pressed={impactView === id} onClick={() => setImpactView(id)}>{t.app.views[id]}</button>
            ))}
          </div>
          {mode === 'transit' && (
            <TransitLayersCard layers={transitLayers} lines={stadtbahnLines} failed={transitFailed} focus={lineFocus}
              onToggle={toggleTransit} onFocus={focusLine} />
          )}
          <Legend mode={mode} tab={tab} date={date} impactView={impactView} outlookPeriod={outlookPeriod} />
        </section>
        <aside className="panel">
          <PanelResizer width={panelWidth} onWidth={setPanelWidth} />
          <div className="panel-head">
            <div className="date-control" aria-label={t.app.dayShown}>
              <button className="icon-button" aria-label={t.app.weekEarlier} onClick={() => setDate(clampDate(date - 7))}>‹</button>
              <span className="date-value">{formatDay(date)}{date === today ? t.app.todaySuffix : ''}</span>
              <button className="icon-button" aria-label={t.app.weekLater} onClick={() => setDate(clampDate(date + 7))}>›</button>
              {date !== today && <button className="link-button" onClick={() => setDate(today)}>{t.app.today}</button>}
            </div>
            <Summary items={stats} />
            {(changes > 0 || settingsChanged > 0) && (
              <div className="scenario">
                <div className="scenario-details">
                  {changes > 0 && <strong>{t.n.change(changes)}</strong>}
                  {publishedLoad && (
                    <span className="muted">
                      <Derived how={[
                        [t.app.publishedPlans, t.app.scenarioHow(publishedClusters, formatShort(busiest(publishedLoad).day), one(busiest(publishedLoad).total))],
                        [t.app.yourScenario, t.app.scenarioHow(clusters.length, formatShort(busiest(load).day), one(busiest(load).total))],
                        [t.app.busiestDay, t.app.busiestOf(dayRange(today, to))],
                      ]}>
                        {t.app.comparison(publishedClusters, clusters.length, Math.round(busiest(publishedLoad).total), Math.round(busiest(load).total))}
                      </Derived>
                    </span>
                  )}
                  {orphaned > 0 && <span className="note">{t.app.orphaned(orphaned)}</span>}
                </div>
                <div className="scenario-actions">
                  <button className="button" onClick={copyLink}>{copied ? t.app.linkCopied : t.app.copyLink}</button>
                  <button className="button" onClick={exportCsv}>{t.app.exportCsv}</button>
                  <button className="button" onClick={() => { setScenario(EMPTY_SCENARIO); setSelectedId(null); }}>{t.app.reset}</button>
                </div>
              </div>
            )}
            <nav className="tabs" role="tablist" aria-label={t.modes.views(t.modes.name[mode])}
              style={{ '--tab': MODES[mode].tabs.indexOf(tab), '--tabs': MODES[mode].tabs.length } as CSSProperties}>
              {MODES[mode].tabs.map((id) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab selected' : 'tab'}
                  onClick={() => switchTab(id)}>{t.app.tabs[id]}</button>
              ))}
            </nav>
          </div>
          <div className="panel-body" ref={panelBody}>
            {settingsOpen && (
              <SettingsPanel settings={settings} changed={settingsChanged} onChange={setSetting}
                onReset={() => setScenario({ ...scenario, settings: {} })} onBack={() => setSettingsOpen(false)} />
            )}
            {selected && !settingsOpen && (
              <>
              <SitePanel
                key={selected.id} site={selected} plan={mode === 'plan'} byId={byId} conflicts={selectedConflicts} advice={siteAdvice} shift={scenario.shifts[selected.id]} date={date} today={today}
                priority={(() => { const i = ranked.findIndex((p) => p.site.id === selected.id); return i >= 0 ? { rank: i + 1, of: ranked.length, p: ranked[i] } : null; })()}
                onShift={(s) => setShift(selected.id, s)} onSelect={selectSite} onBack={() => setSelectedId(null)} onRemove={() => removeProject(selected.id)}
              />
              {mode === 'plan' && <ImpactScorePanel assessment={assessment} target={impactTarget} locations={businessLocations} scenario={changeCount(scenario) > 0}
                locationError={locationError} onTarget={(target) => { setImpactTarget(target); setLocationError(null); }}
                onAdd={() => {
                  setLocationError(null);
                  setPick({ hint: t.app.pickBusiness, done: (at) => {
                    if (!validLonLat(at)) { setLocationError(t.app.outsideStudyArea); return; }
                    setBusinessLocations((items) => [...items, { name: t.app.businessName(items.length + 1), detail: t.app.businessDetail, district: '', at }]);
                  } });
                }}
                onRename={(index, name) => setBusinessLocations((items) => items.map((p, i) => i === index ? { ...p, name } : p))}
                onRemove={(index) => setBusinessLocations((items) => items.filter((_, i) => i !== index))} />}
              <TrafficContextPanel context={selectedTraffic} evidence={selectedEvidence} byId={byId} onSelect={selectSite} scenario={changeCount(scenario) > 0} />
              </>
            )}
            <div hidden={!!selected || settingsOpen || tab !== 'todo'}>
              <TodoTab todo={todo} byId={byId} horizon={horizon} onSelectSite={selectSite} onShift={setShift}
                onOpenDistrict={(name) => { switchMode('transit', 'transit'); selectDistrict(name); }} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'outlook'} className="tab-body">
              <OutlookPanel result={outlookResult} days={outlookDays} byId={byId} mapFiltered={outlookMap}
                retrievedAt={data.retrievedAt} scenario={changeCount(scenario) > 0} onSelect={selectSite}
                onDays={(days) => { setOutlookDays(days); setOutlookMap(true); }} onMapFilter={setOutlookMap} />
            </div>
            <div hidden={!!selected || settingsOpen || tab !== 'coordinate'}>
              <CoordinateTab
                byId={byId} clusters={clusters} advice={advice} bundles={bundles} today={today} horizon={horizon}
                selectedCluster={clusterId} onSelectCluster={selectCluster} onSelectSite={selectSite} onShift={setShift} balance={balance}
                draft={draft} draftPlace={draftPlace}
                onPlace={() => setPick({ hint: t.app.pickProject, done: setDraft })}
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
              <TransitTab gaps={gaps} pressure={pressure} bikes={data.bikes} parkRide={data.parkRide} date={date}
                selected={district} onSelect={selectDistrict} onSelectSite={selectSite} />
            </div>
            {MODES[mode].groups.length > 0 && <div hidden={!!selected || settingsOpen || tab !== 'routes'}>
              <RoutesTab key={mode} groups={MODES[mode].groups} active={active} date={date} fire={data.fire} hospitals={data.hospitals} parkRide={data.parkRide} districts={districtsWithResidents}
                onOverlay={showOverlay} onPick={(hint, done) => setPick({ hint, done })} onSelectSite={selectSite} />
            </div>}
          </div>
        </aside>
      </div>
      <Timeline load={load} published={publishedLoad} holidays={holidays} today={today} date={date} horizon={horizon} onDate={setDate} outlookPeriod={outlookPeriod} />
      <footer className="footer muted">{t.app.footer}</footer>
    </div>
    </SettingsContext>
  );
}

function Legend({ mode, tab, date, impactView, outlookPeriod }: { mode: Mode; tab: Tab; date: number; impactView: ImpactView; outlookPeriod: { from: number; to: number } | null }) {
  const t = useStrings().legend;
  // folded on phones, where it would cover half the map
  const [open] = useState(() => !window.matchMedia('(max-width: 960px)').matches);
  return (
    <details className="legend" open={open}>
      <summary className="legend-title">{outlookPeriod ? t.outlook(formatShort(outlookPeriod.from), formatShort(outlookPeriod.to)) : t.sitesOn(formatShort(date))}</summary>
      {impactView === 'bands' ? (
        <>
          <div className="legend-row"><i className="swatch high" />{t.high}</div>
          <div className="legend-row"><i className="swatch medium" />{t.medium}</div>
          <div className="legend-row"><i className="swatch low" />{t.low}</div>
        </>
      ) : (
        <div className="legend-row"><i className="ramp impact" />{t.heat}</div>
      )}
      <div className="legend-row"><i className="swatch later" />{outlookPeriod ? t.startsInPeriod : t.startsSoon}</div>
      {tab === 'coordinate' && (
        <>
          <div className="legend-row"><i className="key-line ink" />{t.sameTime}</div>
          <div className="legend-row"><i className="key-line bundle" />{t.sameStretch}</div>
        </>
      )}
      {tab === 'todo' && <div className="legend-row"><span className="glyph">1</span>{t.todoNumber}</div>}
      {tab === 'priorities' && <div className="legend-row"><span className="glyph">1</span>{t.rank}</div>}
      {tab === 'capacity' && <div className="legend-row"><i className="ramp" />{t.load}</div>}
      {(tab === 'capacity' || tab === 'transit') && <div className="legend-row"><i className="key-line selection" />{t.district}</div>}
      {tab === 'transit' && <div className="legend-row"><i className="ramp" />{t.need}</div>}
      {tab === 'routes' && (
        <>
          <div className="legend-row"><i className="key-line normal" />{t.normal}</div>
          <div className="legend-row"><i className="key-line aware" />{t.aware}</div>
          {mode === 'emergency' && <div className="legend-row"><i className="swatch lost" />{t.lost}</div>}
        </>
      )}
      {mode === 'emergency' && <div className="legend-row"><span className="glyph">F</span>{t.fire} · <span className="glyph">H</span>{t.hospital}</div>}
    </details>
  );
}
