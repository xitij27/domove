// The one map. Every tab is a state of it: sites always, plus the tab's own layers.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { AttributionControl, Map as MlMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { bandOf, isActive } from '../model/analysis';
import { KIND_LABEL } from '../model/closures';
import type { LonLat } from '../model/geo';
import { ROAD_LABEL } from '../model/sites';
import type { Site } from '../model/sites';
import { dayRange } from './format';
import { PALETTES } from './theme';
import type { Palette, Theme } from './theme';

// The bundled build can't find the worker next to its own chunk, so point it there.
setWorkerUrl(workerUrl);

const STYLES: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const DORTMUND: LonLat = [7.4653, 51.5136];
const FONT = ['Noto Sans Regular'];

/** How the works are coloured: by band, by a smooth ramp on impact, or as a heat surface. */
export type ImpactView = 'bands' | 'gradient' | 'heat';

export type PoiKind = 'stop' | 'bike' | 'pr' | 'fire' | 'hospital';
const POI_GLYPH: Record<PoiKind, string> = { stop: 'U', bike: 'B', pr: 'P', fire: 'F', hospital: 'H' };
export type MapPoi = { kind: PoiKind; name: string; detail?: string; at: LonLat };
export type MapLink = { from: LonLat; to: LonLat; type: 'compound' | 'bundle' };
export type MapOverlay = {
  normal?: LonLat[];
  aware?: LonLat[];
  ends?: LonLat[];
  reach?: Polygon | MultiPolygon;
  lost?: Polygon | MultiPolygon | null;
};
/** A new object each time the map should fit, even to the same place again. */
export type MapFocus = { bounds: [number, number, number, number] };
export type DistrictValue = { name: string; geometry: Polygon | MultiPolygon; value: number | null };

type Props = {
  theme: Theme;
  impactView: ImpactView;
  sites: Site[];
  date: number;
  selectedId: string | null;
  highlightIds: string[];
  ranks: Map<string, number> | null;
  links: MapLink[];
  districts: DistrictValue[];
  selectedDistrict: string | null;
  pois: MapPoi[];
  overlay: MapOverlay | null;
  focus: MapFocus | null;
  picking: boolean;
  onPick: (at: LonLat) => void;
  onSelectSite: (id: string) => void;
  onSelectDistrict: (name: string) => void;
};

const SITE_LAYERS = ['site-fill', 'site-dot'];
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
// the route around the works draws itself from A to B: coloured up to t of its length
const drawnTo = (color: string, t: number): ExpressionSpecification => ['step', ['line-progress'], color, t, TRANSPARENT];
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls draw(t) with t from 0 to 1 over `ms`, once per frame; returns a cancel for effect cleanup. */
function animate(ms: number, draw: (t: number) => void): () => void {
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    const t = Math.min(1, (now - start) / ms);
    draw(t);
    if (t < 1) frame = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame);
}

const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

function addLayers(map: MlMap, p: Palette) {
  const empty = collection([]);
  for (const id of ['districts', 'sites', 'site-points', 'links', 'pois', 'route', 'reach']) map.addSource(id, { type: 'geojson', data: empty, lineMetrics: id === 'route' });
  const band: ExpressionSpecification = ['match', ['get', 'band'], 'high', p.severity.high, 'medium', p.severity.medium, p.severity.low];
  const seq = p.sequential;
  map.addLayer({
    id: 'district-fill', type: 'fill', source: 'districts', filter: ['has', 'v'],
    paint: { 'fill-color': ['step', ['get', 'v'], seq[0], 0.2, seq[1], 0.4, seq[2], 0.6, seq[3], 0.8, seq[4]], 'fill-opacity': 0.5 },
  });
  map.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: { 'line-color': p.muted, 'line-width': 1 } });
  map.addLayer({ id: 'district-selected', type: 'line', source: 'districts', filter: ['==', ['get', 'sel'], 1], paint: { 'line-color': p.ink, 'line-width': 2.5 } });
  map.addLayer({ id: 'reach-fill', type: 'fill', source: 'reach', filter: ['==', ['get', 'role'], 'reach'], paint: { 'fill-color': p.accent, 'fill-opacity': 0.1 } });
  map.addLayer({ id: 'reach-line', type: 'line', source: 'reach', filter: ['==', ['get', 'role'], 'reach'], paint: { 'line-color': p.accent, 'line-width': 1.5 } });
  map.addLayer({ id: 'lost-fill', type: 'fill', source: 'reach', filter: ['==', ['get', 'role'], 'lost'], paint: { 'fill-color': p.critical, 'fill-opacity': 0.35 } });
  map.addLayer({
    id: 'site-heat', type: 'heatmap', source: 'site-points', filter: ['==', ['get', 'state'], 'active'], layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['^', ['get', 'sev'], 2], // squared, so a full closure outweighs a pile of parking lanes
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 30, 13, 70, 15, 120],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, TRANSPARENT, 0.1, p.severity.low, 0.45, p.severity.medium, 0.9, p.severity.high],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.9, 17, 0.3],
    },
  });
  map.addLayer({
    id: 'site-fill', type: 'fill', source: 'sites', minzoom: 12,
    paint: { 'fill-color': band, 'fill-opacity': ['match', ['get', 'state'], 'active', 0.55, 0.18] },
  });
  map.addLayer({
    id: 'site-line', type: 'line', source: 'sites', minzoom: 12, filter: ['==', ['get', 'state'], 'active'],
    paint: { 'line-color': band, 'line-width': 1.5 },
  });
  map.addLayer({
    id: 'site-line-later', type: 'line', source: 'sites', minzoom: 12, filter: ['!=', ['get', 'state'], 'active'],
    paint: { 'line-color': band, 'line-width': 1.5, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'site-proposed', type: 'line', source: 'sites', filter: ['==', ['get', 'hyp'], 1],
    paint: { 'line-color': p.ink, 'line-width': 2, 'line-dasharray': [1, 1.5] },
  });
  map.addLayer({
    id: 'site-highlight', type: 'line', source: 'sites', filter: ['==', ['get', 'hi'], 1],
    paint: { 'line-color': p.ink, 'line-width': ['case', ['==', ['get', 'sel'], 1], 3, 1.75] },
  });
  map.addLayer({
    id: 'link-compound', type: 'line', source: 'links', filter: ['==', ['get', 'type'], 'compound'],
    paint: { 'line-color': p.ink, 'line-width': 1.5, 'line-opacity': 0.75 },
  });
  map.addLayer({
    id: 'link-bundle', type: 'line', source: 'links', filter: ['==', ['get', 'type'], 'bundle'],
    paint: { 'line-color': p.accent, 'line-width': 2.5, 'line-dasharray': [1.5, 1] },
  });
  map.addLayer({
    id: 'route-normal', type: 'line', source: 'route', filter: ['==', ['get', 'role'], 'normal'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.muted, 'line-width': 6, 'line-opacity': 0.75 },
  });
  map.addLayer({
    id: 'route-aware', type: 'line', source: 'route', filter: ['==', ['get', 'role'], 'aware'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': drawnTo(p.accent, 1), 'line-width': 3.5 },
  });
  map.addLayer({
    id: 'site-ping', type: 'circle', source: 'site-points', filter: ['==', ['get', 'sel'], 1],
    paint: { 'circle-radius': 0, 'circle-color': TRANSPARENT, 'circle-stroke-color': p.ink, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0 },
  });
  map.addLayer({
    id: 'site-dot', type: 'circle', source: 'site-points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['+', 2.5, ['*', 4, ['get', 'sev']]], 14, ['+', 4, ['*', 6, ['get', 'sev']]]],
      'circle-color': band,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, ['match', ['get', 'state'], 'active', 1, 0.45], 16, 0],
      'circle-stroke-color': ['case', ['==', ['get', 'hi'], 1], p.ink, p.surface],
      'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 3, ['==', ['get', 'hi'], 1], 2, 1.5],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 0],
    },
  });
  map.addLayer({
    id: 'site-rank', type: 'symbol', source: 'site-points', filter: ['has', 'rank'],
    layout: { 'text-field': ['to-string', ['get', 'rank']], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, -1.4], 'text-allow-overlap': true },
    paint: { 'text-color': p.ink, 'text-halo-color': p.surface, 'text-halo-width': 2 },
  });
  // bike-share stations are many: only once zoomed in, so the city view stays readable
  for (const [suffix, minor, minzoom] of [['', 0, 0], ['-minor', 1, 13]] as const) {
    map.addLayer({
      id: `poi-dot${suffix}`, type: 'circle', source: 'pois', minzoom, filter: ['==', ['get', 'minor'], minor],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 7],
        'circle-color': p.surface, 'circle-stroke-color': p.ink, 'circle-stroke-width': 1.25,
      },
    });
    map.addLayer({
      id: `poi-glyph${suffix}`, type: 'symbol', source: 'pois', minzoom: Math.max(minzoom, 12), filter: ['==', ['get', 'minor'], minor],
      layout: { 'text-field': ['get', 'glyph'], 'text-font': FONT, 'text-size': 9, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': p.ink },
    });
  }
  map.addLayer({
    id: 'route-ends', type: 'circle', source: 'route', filter: ['==', ['get', 'role'], 'end'],
    paint: { 'circle-radius': 7, 'circle-color': p.ink, 'circle-stroke-color': p.surface, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'route-ends-label', type: 'symbol', source: 'route', filter: ['==', ['get', 'role'], 'end'],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': p.surface },
  });
}

/** Repaints the works for the chosen view; the layers themselves are added once, in addLayers. */
function applyImpactView(map: MlMap, p: Palette, view: ImpactView) {
  const { low, medium, high } = p.severity;
  const band: ExpressionSpecification = ['match', ['get', 'band'], 'high', high, 'medium', medium, low];
  // gradient: one hue whose strength is the impact, so small works fade and big ones stand out
  const color = view === 'bands' ? band : high;
  const active: ExpressionSpecification = ['==', ['get', 'state'], 'active'];
  const fillOpacity: ExpressionSpecification | number = view === 'bands'
    ? ['match', ['get', 'state'], 'active', 0.55, 0.18]
    : view === 'gradient'
      ? ['case', active, ['+', 0.06, ['*', 0.9, ['get', 'sev']]], 0.05]
      : 0.04; // heat: the surface carries the impact, the footprints just stay findable
  map.setPaintProperty('site-fill', 'fill-color', color);
  map.setPaintProperty('site-fill', 'fill-opacity', fillOpacity);
  map.setPaintProperty('site-line', 'line-color', color);
  map.setPaintProperty('site-line', 'line-opacity', view === 'gradient' ? ['+', 0.25, ['*', 0.75, ['get', 'sev']]] : 1);
  map.setPaintProperty('site-line-later', 'line-color', color);
  map.setPaintProperty('site-dot', 'circle-color', color);
  map.setLayoutProperty('site-dot', 'visibility', view === 'heat' ? 'none' : 'visible');
  map.setLayoutProperty('site-heat', 'visibility', view === 'heat' ? 'visible' : 'none');
}

function siteState(s: Site, date: number): 'active' | 'upcoming' | 'other' | null {
  if (isActive(s, date)) return 'active';
  if (s.start > date && s.start <= date + 30) return 'upcoming';
  return null;
}

function siteCollections(sites: Site[], date: number, selectedId: string | null, highlight: string[], ranks: Map<string, number> | null) {
  const hi = new Set(highlight);
  const polygons: Feature[] = [];
  const points: Feature[] = [];
  for (const s of sites) {
    const state = siteState(s, date) ?? (s.hypothetical || hi.has(s.id) || ranks?.has(s.id) ? 'other' : null);
    if (!state) continue;
    const properties = {
      id: s.id, band: bandOf(s.severity), sev: s.severity, state, hyp: s.hypothetical ? 1 : 0,
      hi: hi.has(s.id) || s.id === selectedId ? 1 : 0, sel: s.id === selectedId ? 1 : 0,
      ...(ranks?.has(s.id) ? { rank: ranks.get(s.id) } : {}),
    };
    polygons.push({ type: 'Feature', geometry: s.geometry, properties });
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: s.center }, properties });
  }
  return { polygons: collection(polygons), points: collection(points) };
}

function popupContent(title: string, lines: string[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-popup';
  const strong = document.createElement('strong');
  strong.textContent = title; // feed text: never innerHTML
  root.append(strong);
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line;
    root.append(div);
  }
  return root;
}

const setData = (map: MlMap | null, id: string, data: FeatureCollection) => (map?.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const themeRef = useRef<Theme | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const byId = useMemo(() => new Map(props.sites.map((s) => [s.id, s])), [props.sites]);

  const initialTheme = useEffectEvent(() => props.theme);
  const onStyleLoad = useEffectEvent(() => {
    if (!mapRef.current) return;
    addLayers(mapRef.current, PALETTES[props.theme]);
    setStyleVersion((v) => v + 1);
  });
  const onClick = useEffectEvent((e: MapMouseEvent) => {
    const map = mapRef.current!;
    if (props.picking) return props.onPick([e.lngLat.lng, e.lngLat.lat]);
    const box: [[number, number], [number, number]] = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const site = map.queryRenderedFeatures(box, { layers: SITE_LAYERS })[0];
    if (site) return props.onSelectSite(String(site.properties.id));
    const district = map.queryRenderedFeatures(e.point, { layers: ['district-fill'] })[0];
    if (district) props.onSelectDistrict(String(district.properties.name));
  });
  const onMove = useEffectEvent((e: MapMouseEvent) => {
    const map = mapRef.current!;
    const popup = popupRef.current!;
    const box: [[number, number], [number, number]] = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const site = props.picking ? undefined : map.queryRenderedFeatures(box, { layers: SITE_LAYERS })[0];
    const poi = props.picking || site ? undefined : map.queryRenderedFeatures(box, { layers: ['poi-dot', 'poi-dot-minor'] })[0];
    map.getCanvas().style.cursor = props.picking ? 'crosshair' : site ? 'pointer' : '';
    const s = site && byId.get(String(site.properties.id));
    if (s) {
      const road = `${KIND_LABEL[s.kind]} · ${ROAD_LABEL[s.road]}${s.roadName ? ` (${s.roadName})` : ''}`;
      popup.setLngLat(e.lngLat).setDOMContent(popupContent(s.title, [road, `${s.hypothetical ? 'Proposed' : s.owner} · ${dayRange(s.start, s.end)}`])).addTo(map);
    } else if (poi) {
      popup.setLngLat(e.lngLat).setDOMContent(popupContent(String(poi.properties.name), [String(poi.properties.detail)].filter(Boolean))).addTo(map);
    } else popup.remove();
  });

  useEffect(() => {
    const theme = initialTheme();
    const map = new MlMap({ container: container.current!, style: STYLES[theme], center: DORTMUND, zoom: 11.2, attributionControl: false });
    themeRef.current = theme;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new AttributionControl({ compact: true, customAttribution: 'Data: Stadt Dortmund (dl-de/zero-2-0) · Routing: Valhalla, FOSSGIS e.V.' }));
    map.on('style.load', () => onStyleLoad());
    // the page footer carries the full attribution, so the map's own starts folded behind its (i) button
    map.once('load', () => {
      const attribution = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      attribution?.classList.remove('maplibregl-compact-show');
      attribution?.removeAttribute('open');
    });
    map.on('click', (e) => onClick(e));
    map.on('mousemove', (e) => onMove(e));
    map.on('mouseout', () => popupRef.current?.remove());
    popupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '280px' });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === props.theme) return;
    themeRef.current = props.theme;
    map.setStyle(STYLES[props.theme], { diff: false }); // a full reload fires style.load, which adds our layers back
  }, [props.theme]);

  useEffect(() => {
    if (mapRef.current?.getLayer('site-heat')) applyImpactView(mapRef.current, PALETTES[props.theme], props.impactView);
  }, [props.impactView, props.theme, styleVersion]);

  const siteData = useMemo(
    () => siteCollections(props.sites, props.date, props.selectedId, props.highlightIds, props.ranks),
    [props.sites, props.date, props.selectedId, props.highlightIds, props.ranks],
  );
  useEffect(() => {
    setData(mapRef.current, 'sites', siteData.polygons);
    setData(mapRef.current, 'site-points', siteData.points);
  }, [siteData, styleVersion]);

  useEffect(() => {
    const max = Math.max(0, ...props.districts.map((d) => d.value ?? 0));
    setData(mapRef.current, 'districts', collection(props.districts.map((d) => ({
      type: 'Feature', geometry: d.geometry,
      properties: { name: d.name, sel: d.name === props.selectedDistrict ? 1 : 0, ...(d.value !== null && max > 0 ? { v: d.value / max } : {}) },
    }))));
  }, [props.districts, props.selectedDistrict, styleVersion]);

  useEffect(() => {
    setData(mapRef.current, 'links', collection(props.links.map((l) => ({
      type: 'Feature', geometry: { type: 'LineString', coordinates: [l.from, l.to] }, properties: { type: l.type },
    }))));
  }, [props.links, styleVersion]);

  useEffect(() => {
    setData(mapRef.current, 'pois', collection(props.pois.map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: p.at }, properties: { name: p.name, detail: p.detail ?? '', glyph: POI_GLYPH[p.kind], minor: p.kind === 'bike' ? 1 : 0 },
    }))));
  }, [props.pois, styleVersion]);

  useEffect(() => {
    const o = props.overlay;
    const lines: Feature[] = [];
    if (o?.normal) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: o.normal }, properties: { role: 'normal' } });
    if (o?.aware) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: o.aware }, properties: { role: 'aware' } });
    const ends = o?.ends ?? [];
    ends.forEach((at, i) => lines.push({ type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: { role: 'end', label: ends.length < 2 ? '' : i ? 'B' : 'A' } }));
    setData(mapRef.current, 'route', collection(lines));
    const areas: Feature[] = [];
    if (o?.reach) areas.push({ type: 'Feature', geometry: o.reach, properties: { role: 'reach' } });
    if (o?.lost) areas.push({ type: 'Feature', geometry: o.lost, properties: { role: 'lost' } });
    setData(mapRef.current, 'reach', collection(areas));
    const map = mapRef.current;
    if (!map || !o?.aware || reducedMotion()) return;
    const color = PALETTES[themeRef.current ?? 'light'].accent;
    return animate(1100, (t) => {
      if (map.getLayer('route-aware')) map.setPaintProperty('route-aware', 'line-gradient', drawnTo(color, easeOut(t)));
    });
  }, [props.overlay, styleVersion]);

  // three rings ripple out from the site just picked, while the camera flies there
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.selectedId || reducedMotion()) return;
    return animate(1800, (t) => {
      if (!map.getLayer('site-ping')) return;
      const k = (t * 3) % 1;
      map.setPaintProperty('site-ping', 'circle-radius', 6 + 26 * easeOut(k));
      map.setPaintProperty('site-ping', 'circle-stroke-opacity', t < 1 ? 1 - k : 0);
    });
  }, [props.selectedId]);

  useEffect(() => {
    if (props.focus) mapRef.current?.fitBounds(props.focus.bounds, { padding: 72, maxZoom: 16, duration: 600 });
  }, [props.focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = props.picking ? 'crosshair' : '';
    if (props.picking) popupRef.current?.remove();
  }, [props.picking]);

  return <div ref={container} className="map" aria-label="Map of Dortmund's construction sites" role="region" />;
}
