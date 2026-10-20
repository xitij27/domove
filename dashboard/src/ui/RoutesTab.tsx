import type { MultiPolygon, Polygon } from 'geojson';
import { useState } from 'react';
import type { Poi } from '../data/sources';
import { decimal, useStrings } from '../i18n';
import type { Strings } from '../i18n';
import { formatDay } from '../model/days';
import type { LonLat } from '../model/geo';
import type { Site } from '../model/sites';
import { emergencyCoverage, penaltyFor, planDetour } from '../routing/valhalla';
import type { Coverage, Detour, Group } from '../routing/valhalla';
import type { MapOverlay } from './MapView';
import { Derived } from './Derived';
import { metres, minutes, shortTitle } from './format';

type Place = { key: string; label: string; at: LonLat };
type Props = {
  /** who the role plans routes for; the first is picked to start */
  groups: Group[];
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
const landmarks = (t: Strings['routes']): Place[] => [
  { key: 'l0', label: 'Dortmund Hauptbahnhof', at: [7.45929, 51.51662] },
  { key: 'l1', label: 'Westfalenhallen', at: [7.45363, 51.49592] },
  { key: 'l2', label: 'TU Dortmund', at: [7.41227, 51.49148] },
  { key: 'l3', label: 'Phoenix-See', at: [7.51413, 51.48933] },
  { key: 'l4', label: t.airport, at: [7.60972, 51.51691] },
  { key: 'l5', label: t.port, at: [7.44432, 51.52453] },
  { key: 'l6', label: 'Westfalenhütte', at: [7.49668, 51.53697] },
];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function PlaceSelect({ label, value, groups, onChange, onPickOnMap }: {
  label: string; value: Place | null; groups: [string, Place[]][]; onChange: (p: Place | null) => void; onPickOnMap: () => void;
}) {
  const t = useStrings().routes;
  const all = groups.flatMap(([, places]) => places);
  return (
    <div className="place">
      <label>
        <span className="place-label">{label}</span>
        <select value={value?.key ?? ''} onChange={(e) => onChange(all.find((p) => p.key === e.target.value) ?? null)}>
          <option value="">{t.choose}</option>
          {value?.key === 'map' && <option value="map">{t.pointOnMap}</option>}
          {groups.map(([name, places]) => (
            <optgroup key={name} label={name}>{places.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
          ))}
        </select>
      </label>
      <button className="button" onClick={onPickOnMap}>{t.pickOnMap}</button>
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

export function RoutesTab({ groups: who, active, date, fire, hospitals, parkRide, districts, onOverlay, onPick, onSelectSite }: Props) {
  const t = useStrings().routes;
  const [group, setGroup] = useState<Group>(who[0]);
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [detour, setDetour] = useState<{ d: Detour; key: string; group: Group } | null>(null);
  const [station, setStation] = useState(0);
  const [reachMinutes, setReachMinutes] = useState(8);
  const [coverage, setCoverage] = useState<{ c: Coverage; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const places = (prefix: string, pois: Poi[]): Place[] => pois.map((p, i) => ({ key: `${prefix}${i}`, label: p.name, at: p.at }));
  const groups: [string, Place[]][] = [
    [t.landmarks, landmarks(t)],
    [t.fireStations, places('f', fire)],
    [t.hospitals, places('h', hospitals)],
    [t.parkRide, places('p', parkRide)],
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
      setDetour({ d, key: routeKey, group });
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
      {group === 'emergency' && (
        <section className="block">
          <h3>{t.reach}</h3>
          <p className="muted">{t.reachHint}</p>
          <div className="form-row">
            <label>{t.station}
              <select value={station} onChange={(e) => setStation(+e.target.value)}>
                {fire.map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
              </select>
            </label>
            <label>{t.within}
              <select value={reachMinutes} onChange={(e) => setReachMinutes(+e.target.value)}>
                {[5, 8, 10, 12].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>
          <button className="button primary" disabled={busy || !fire.length} onClick={checkReach}>{busy ? t.asking : t.checkReach}</button>
          {c && (
            <div className="result" aria-live="polite">
              {coverage.key !== coverageKey && <p className="note">{t.reachStale}</p>}
              <dl className="facts">
                <dt>{t.reachLabel}</dt><dd>{t.normally(decimal(c.normalKm2, 1))}</dd>
                <dt>{t.lostLabel}</dt>
                <dd className={c.lostKm2 > 0 ? 'warn-text' : ''}>
                  {c.lostKm2 > 0 ? <><span aria-hidden="true">⚠ </span>{t.lost(decimal(c.lostKm2, 2), decimal((c.lostKm2 / c.normalKm2) * 100, 1))}<Derived how={[
                  [t.lostArea, t.lostAreaHow(decimal(c.lostKm2, 2), decimal(c.normalKm2, 1))],
                  [t.residents, t.residentsHow],
                ]}>{t.residentsAbout(Math.round(c.residents / 10) * 10)}</Derived></> : t.nothing}
                </dd>
              </dl>
              <p className="muted small">{t.counted(c.used.length, c.skipped)} {t.generalised}</p>
            </div>
          )}
        </section>
      )}
      <section className="block">
        <h3>{t.title(formatDay(date))}</h3>
        {who.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label={t.who}>
            {who.map((g) => (
              <button key={g} role="radio" aria-checked={group === g} className={group === g ? 'selected' : ''} onClick={() => setGroup(g)}>{t.groups[g].label}</button>
            ))}
          </div>
        )}
        <p className="muted small">{t.groups[group].note}</p>
        <PlaceSelect label={t.start} value={from} groups={groups} onChange={(p) => { setFrom(p); showEnds(p, to); }}
          onPickOnMap={() => onPick(t.pickStart, (at) => { const p = { key: 'map', label: t.pointOnMap, at }; setFrom(p); showEnds(p, to); })} />
        <PlaceSelect label={t.destination} value={to} groups={groups} onChange={(p) => { setTo(p); showEnds(from, p); }}
          onPickOnMap={() => onPick(t.pickDestination, (at) => { const p = { key: 'map', label: t.pointOnMap, at }; setTo(p); showEnds(from, p); })} />
        <button className="button primary" disabled={!from || !to || busy} onClick={compare}>{busy ? t.asking : t.compare}</button>
        {error && <p className="error" role="alert">{error}</p>}
        {d && (
          <div className="result" aria-live="polite">
            {detour.key !== routeKey && <p className="note">{t.stale}</p>}
            <dl className="facts">
              <dt><i className="key-line normal" />{t.normal}</dt><dd>{minutes(d.normal.seconds)} · {metres(d.normal.meters)}</dd>
              <dt><i className="key-line aware" />{t.withWorks}</dt>
              <dd>
                <Derived how={[
                  [t.normal, t.normalHow(minutes(d.normal.seconds))],
                  [t.around, t.aroundHow(minutes(d.aware.seconds), d.avoided.length)],
                  [t.waiting, d.slowedOnRoute.length
                    ? `+${minutes(d.penaltyS)}: ${d.slowedOnRoute.map((s) => `${shortTitle(s.title)} ${penaltyFor(s, detour.group)} s`).join(' · ')}`
                    : t.noWaiting],
                  [t.withWorks, `${minutes(d.aware.seconds)} + ${minutes(d.penaltyS)} = ${minutes(d.normal.seconds + d.extraS)}`],
                ]}>
                  <strong>{minutes(d.normal.seconds + d.extraS)}</strong>
                </Derived> · {metres(d.aware.meters)} {d.extraS >= 30 ? t.extra(minutes(d.extraS)) : t.noDelay}</dd>
            </dl>
            {d.penaltyS > 0 && <p className="muted small">{t.includes(minutes(d.penaltyS), d.slowedOnRoute.length)}</p>}
            {d.blockedOnRoute.length > 0 && <p className="warn-text"><span aria-hidden="true">⚠</span> {t.noWayAround(d.blockedOnRoute.length)}</p>}
            {d.limitReached && <p className="note">{t.limit}</p>}
            <SiteList title={t.avoided} sites={d.avoided} onSelectSite={onSelectSite} />
            <SiteList title={t.blocked} sites={d.blockedOnRoute} onSelectSite={onSelectSite} />
            <SiteList title={t.passed} sites={d.slowedOnRoute} onSelectSite={onSelectSite} />
          </div>
        )}
      </section>

    </div>
  );
}
