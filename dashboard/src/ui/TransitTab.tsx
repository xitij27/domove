import type { DistrictGap, StopPressure } from '../model/analysis';
import { PER_RESIDENTS, poisNear } from '../model/analysis';
import type { Poi } from '../data/sources';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { metres, num, plural, shortTitle } from './format';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { transitWorking } from './working';

type Props = {
  gaps: DistrictGap[];
  pressure: StopPressure[];
  bikes: Poi[];
  parkRide: Poi[];
  date: number;
  residentsYear: string;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onSelectSite: (id: string) => void;
};

function Actions({ gap, pressure, bikes, parkRide, onSelectSite }: { gap: DistrictGap } & Pick<Props, 'pressure' | 'bikes' | 'parkRide' | 'onSelectSite'>) {
  const cfg = useSettings();
  const worst = gap.uncoveredSites[0];
  const stops = pressure.filter((p) => p.stop.district === gap.district);
  const nearBikes = poisNear(bikes, gap.uncoveredSites, 400);
  const pr = parkRide.filter((p) => p.district === gap.district);
  const actions = [
    worst && (
      <li key="bus">
        Boost bus frequency or run a shuttle: <button className="link-button" onClick={() => onSelectSite(worst.id)}>{shortTitle(worst.title)}</button> is
        {' '}{metres(worst.rail.m)} from the nearest Stadtbahn stop, {worst.rail.name}. All closures this far from the Stadtbahn are listed below.
      </li>
    ),
    gap.mainRoadSites.length > 0 && (
      <li key="dsw">Agree bus diversions with DSW21 for {plural(gap.mainRoadSites.length, 'closure')} on main roads: {gap.mainRoadSites.map((s) => shortTitle(s.title)).join(', ')}.</li>
    ),
    ...stops.map((p) => (
      <li key={p.stop.name}>Expect extra riders at {p.stop.name}{p.stop.detail ? ` (${p.stop.detail})` : ''}: {plural(p.sites.length, 'serious closure')} within {metres(cfg['stop.radius'])}.</li>
    )),
    nearBikes.length > 0 && <li key="bike">Promote bike share: {plural(nearBikes.length, 'station')} within 400 m of the affected streets.</li>,
    pr.length > 0 && <li key="pr">Point car commuters to {pr.map((p) => p.name).join(', ')}.</li>,
  ].filter(Boolean);
  return actions.length ? <ul className="actions">{actions}</ul> : <p className="ok">Every closure here has a Stadtbahn stop within walking distance.</p>;
}

export function TransitTab({ gaps, pressure, bikes, parkRide, date, residentsYear, selected, onSelect, onSelectSite }: Props) {
  const cfg = useSettings();
  const max = Math.max(...gaps.map((g) => g.score), 0.01);
  const gap = gaps.find((g) => g.district === selected);
  return (
    <div className="tab-body">
      <section className="block">
        <h3>Where transit needs attention</h3>
        <Info>
          The bar weighs closures with no Stadtbahn stop within {metres(cfg['reach.rail'])}, plus {num(cfg['transit.mainRoadShare'])} × the weight of
          closures on main roads where buses run, by how disruptive they are, per {PER_RESIDENTS.toLocaleString('en-GB')} residents
          ({residentsYear || 'latest'} population), from {formatDay(date)} for {cfg['transit.days']} days.
          The number is how many closures are far from the Stadtbahn.
        </Info>
        <div className="bar-head muted small" aria-hidden="true"><span>District</span><span>Need per resident</span><span>Far from rail</span></div>
        <ul className="bars" aria-label="Districts by transit need">
          {gaps.map((g) => (
            <li key={g.district} className={g.district === selected ? 'bar-row selected' : 'bar-row'}>
              <button className="bar-pick" onClick={() => onSelect(g.district === selected ? null : g.district)} aria-pressed={g.district === selected}>
                <span className="bar-label">{g.district}</span>
                <span className="bar-track"><span className="bar" style={{ width: `${(g.score / max) * 100}%` }} /></span>
              </button>
              <span className="bar-value"><Derived how={transitWorking(g, cfg)}>{g.uncoveredSites.length}</Derived></span>
            </li>
          ))}
        </ul>
      </section>
      {gap && (
        <section className="block">
          <h3>{gap.district}</h3>
          <p className="muted">
            {gap.residents.toLocaleString('en-GB')} residents · {plural(gap.uncoveredSites.length, 'closure')} beyond walking distance of
            the Stadtbahn · {plural(gap.mainRoadSites.length, 'closure')} on main roads
          </p>
          <h4>Suggested actions</h4>
          <Actions gap={gap} pressure={pressure} bikes={bikes} parkRide={parkRide} onSelectSite={onSelectSite} />
          {gap.uncoveredSites.length > 0 && (
            <>
              <h4>Closures without a Stadtbahn nearby</h4>
              <ul className="plain">
                {gap.uncoveredSites.map((s) => (
                  <li key={s.id}><button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button> <span className="muted">{metres(s.rail.m)} to {s.rail.name}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
