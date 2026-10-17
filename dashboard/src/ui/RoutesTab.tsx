import type { MultiPolygon, Polygon } from 'geojson';
import { useState } from 'react';
import type { Poi } from '../data/sources';
import { formatDay } from '../model/days';
import type { LonLat } from '../model/geo';
import type { Site } from '../model/sites';
import { emergencyCoverage, GROUPS, planDetour } from '../routing/valhalla';
import type { Coverage, Detour, Group } from '../routing/valhalla';
import type { MapOverlay } from './MapView';
import { metres, minutes, plural } from './format';

type Place = { key: string; label: string; at: LonLat };
type Props = {
  active: Site[];
  date: number;
  fire: Poi[];
  hospitals: Poi[];
  parkRide: Poi[];
  districts: { geometry: Polygon | MultiPolygon; residents: number }[];
  onOverlay: (overlay: MapOverlay | null) => void;
  onPick: (hint: string, done: (at: LonLat) => void) => void;
  onSelectSite: (id: string) => void;
};

// Checked with Photon on 17 Oct 2026.
const LANDMARKS: Place[] = [
  { key: 'l0', label: 'Dortmund Hauptbahnhof', at: [7.45929, 51.51662] },
  { key: 'l1', label: 'Westfalenhallen', at: [7.45363, 51.49592] },
  { key: 'l2', label: 'TU Dortmund', at: [7.41227, 51.49148] },
  { key: 'l3', label: 'Phoenix-See', at: [7.51413, 51.48933] },
  { key: 'l4', label: 'Dortmund Airport', at: [7.60972, 51.51691] },
  { key: 'l5', label: 'Port, Speicherstraße', at: [7.44432, 51.52453] },
  { key: 'l6', label: 'Westfalenhütte', at: [7.49668, 51.53697] },
];
const GROUP_ORDER: Group[] = ['commuter', 'logistics', 'emergency', 'cyclist', 'pedestrian'];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PlaceSelect({ label, value, groups, onChange, onPickOnMap }: {
  label: string; value: Place | null; groups: [string, Place[]][]; onChange: (p: Place | null) => void; onPickOnMap: () => void;
}) {
  const all = groups.flatMap(([, places]) => places);
  return (
    <div className="place">
      <label>
        <span className="place-label">{label}</span>
        <select value={value?.key ?? ''} onChange={(e) => onChange(all.find((p) => p.key === e.target.value) ?? null)}>
          <option value="">Choose a place…</option>
          {value?.key === 'map' && <option value="map">Point on the map</option>}
          {groups.map(([name, places]) => (
            <optgroup key={name} label={name}>{places.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
          ))}
        </select>
      </label>
      <button className="button" onClick={onPickOnMap}>Pick on map</button>
    </div>
  );
}

function SiteList({ title, sites, onSelectSite }: { title: string; sites: Site[]; onSelectSite: (id: string) => void }) {
  if (!sites.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul className="plain">{sites.map((s) => <li key={s.id}><button className="link-button" onClick={() => onSelectSite(s.id)}>{s.title}</button></li>)}</ul>
    </>
  );
}

export function RoutesTab({ active, date, fire, hospitals, parkRide, districts, onOverlay, onPick, onSelectSite }: Props) {
  const [group, setGroup] = useState<Group>('commuter');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [detour, setDetour] = useState<{ d: Detour; key: string } | null>(null);
  const [station, setStation] = useState(0);
  const [reachMinutes, setReachMinutes] = useState(8);
  const [coverage, setCoverage] = useState<{ c: Coverage; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const places = (prefix: string, pois: Poi[]): Place[] => pois.map((p, i) => ({ key: `${prefix}${i}`, label: p.name, at: p.at }));
  const groups: [string, Place[]][] = [
    ['Landmarks', LANDMARKS],
    ['Fire and rescue stations', places('f', fire)],
    ['Hospitals', places('h', hospitals)],
    ['Park and ride', places('p', parkRide)],
  ];
  const routeKey = `${group}|${from?.key}:${from?.at}|${to?.key}:${to?.at}|${date}`;
  const coverageKey = `${station}|${reachMinutes}|${date}`;
  const showEnds = (a: Place | null, b: Place | null) => onOverlay({ ends: [a, b].filter((p): p is Place => !!p).map((p) => p.at) });

  const compare = async () => {
    if (!from || !to) return;
    setBusy(true);
    setError(null);
    try {
      const d = await planDetour(group, from.at, to.at, active);
      setDetour({ d, key: routeKey });
      setCoverage(null);
      onOverlay({ normal: d.normal.line, aware: d.aware.line, ends: [from.at, to.at] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const checkReach = async () => {
    const s = fire[station];
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const c = await emergencyCoverage(s.at, reachMinutes, active, districts);
      setCoverage({ c, key: coverageKey });
      setDetour(null);
      onOverlay({ reach: c.normal, lost: c.lost, ends: [s.at] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const d = detour?.d;
  const c = coverage?.c;
  return (
    <div className="tab-body">
      <section className="block">
        <h3>Alternative routes on {formatDay(date)}</h3>
        <div className="segmented" role="radiogroup" aria-label="Who is travelling">
          {GROUP_ORDER.map((g) => (
            <button key={g} role="radio" aria-checked={group === g} className={group === g ? 'selected' : ''} onClick={() => setGroup(g)}>{GROUPS[g].label}</button>
          ))}
        </div>
        <p className="muted small">{GROUPS[group].note}</p>
        <PlaceSelect label="Start" value={from} groups={groups} onChange={(p) => { setFrom(p); showEnds(p, to); }}
          onPickOnMap={() => onPick('Click the start on the map', (at) => { const p = { key: 'map', label: 'Point on the map', at }; setFrom(p); showEnds(p, to); })} />
        <PlaceSelect label="Destination" value={to} groups={groups} onChange={(p) => { setTo(p); showEnds(from, p); }}
          onPickOnMap={() => onPick('Click the destination on the map', (at) => { const p = { key: 'map', label: 'Point on the map', at }; setTo(p); showEnds(from, p); })} />
        <button className="button primary" disabled={!from || !to || busy} onClick={compare}>{busy ? 'Asking the router…' : 'Compare routes'}</button>
        {error && <p className="error" role="alert">{error}</p>}
        {d && (
          <div className="result" aria-live="polite">
            {detour.key !== routeKey && <p className="note">Settings or day changed since this result: compare again to update it.</p>}
            <dl className="facts">
              <dt><i className="key-line normal" />Normal</dt><dd>{minutes(d.normal.seconds)} · {metres(d.normal.meters)}</dd>
              <dt><i className="key-line aware" />With the works</dt>
              <dd><strong>{minutes(d.normal.seconds + d.extraS)}</strong> · {metres(d.aware.meters)} {d.extraS >= 30 ? `(+${minutes(d.extraS)})` : '(no real delay)'}</dd>
            </dl>
            {d.penaltyS > 0 && <p className="muted small">Includes {minutes(d.penaltyS)} of waiting at {plural(d.slowedOnRoute.length, 'site')} the route still passes.</p>}
            {d.blockedOnRoute.length > 0 && <p className="warn-text"><span aria-hidden="true">⚠</span> No way around {plural(d.blockedOnRoute.length, 'closure')}: the trip starts or ends inside it, or every other way is closed too.</p>}
            {d.limitReached && <p className="note">More closures lie on the way than the public router accepts at once; the result may still pass some.</p>}
            <SiteList title="Avoided" sites={d.avoided} onSelectSite={onSelectSite} />
            <SiteList title="Still on the route, blocked" sites={d.blockedOnRoute} onSelectSite={onSelectSite} />
            <SiteList title="Passed, with waiting time" sites={d.slowedOnRoute} onSelectSite={onSelectSite} />
          </div>
        )}
      </section>

      {group === 'emergency' && (
        <section className="block">
          <h3>Emergency reach</h3>
          <p className="muted">What a fire and rescue station reaches in time, without and with the day's full closures.</p>
          <div className="form-row">
            <label>Station
              <select value={station} onChange={(e) => setStation(+e.target.value)}>
                {fire.map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
              </select>
            </label>
            <label>Within
              <select value={reachMinutes} onChange={(e) => setReachMinutes(+e.target.value)}>
                {[5, 8, 10, 12].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>
          <button className="button primary" disabled={busy || !fire.length} onClick={checkReach}>{busy ? 'Asking the router…' : 'Check reach'}</button>
          {c && (
            <div className="result" aria-live="polite">
              {coverage.key !== coverageKey && <p className="note">Settings or day changed since this result: check again to update it.</p>}
              <dl className="facts">
                <dt>Reach</dt><dd>{c.normalKm2.toFixed(1)} km² normally</dd>
                <dt>Lost to works</dt>
                <dd className={c.lostKm2 > 0 ? 'warn-text' : ''}>
                  {c.lostKm2 > 0 ? <><span aria-hidden="true">⚠ </span>{c.lostKm2.toFixed(2)} km² ({((c.lostKm2 / c.normalKm2) * 100).toFixed(1)} %), about {Math.round(c.residents / 10) * 10} residents</> : 'Nothing measurable'}
                </dd>
              </dl>
              <p className="muted small">
                Counted {plural(c.used.length, 'full closure')} inside the reach{c.skipped ? `, the ${c.used.length} most severe; ${c.skipped} more exceed the public router's limit` : ''}.
                Reach areas are generalised, so treat small losses as indicative.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
