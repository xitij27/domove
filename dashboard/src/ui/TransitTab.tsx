import type { DistrictGap, StopPressure } from '../model/analysis';
import { PER_RESIDENTS, poisNear } from '../model/analysis';
import type { Poi } from '../data/sources';
import { useStrings, whole } from '../i18n';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { metres, num, shortTitle } from './format';
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
  const t = useStrings().transit;
  const worst = gap.uncoveredSites[0];
  const stops = pressure.filter((p) => p.stop.district === gap.district);
  const nearBikes = poisNear(bikes, gap.uncoveredSites, 400);
  const pr = parkRide.filter((p) => p.district === gap.district);
  const actions = [
    worst && (
      <li key="bus">
        {t.boost(<button className="link-button" onClick={() => onSelectSite(worst.id)}>{shortTitle(worst.title)}</button>, metres(worst.rail.m), worst.rail.name)}
      </li>
    ),
    gap.mainRoadSites.length > 0 && (
      <li key="dsw">{t.diversions(gap.mainRoadSites.length, gap.mainRoadSites.map((s) => shortTitle(s.title)).join(', '))}</li>
    ),
    ...stops.map((p) => (
      <li key={p.stop.name}>{t.riders(`${p.stop.name}${p.stop.detail ? ` (${p.stop.detail})` : ''}`, p.sites.length, metres(cfg['stop.radius']))}</li>
    )),
    nearBikes.length > 0 && <li key="bike">{t.bikes(nearBikes.length)}</li>,
    pr.length > 0 && <li key="pr">{t.parkRide(pr.map((p) => p.name).join(', '))}</li>,
  ].filter(Boolean);
  return actions.length ? <ul className="actions">{actions}</ul> : <p className="ok">{t.covered}</p>;
}

export function TransitTab({ gaps, pressure, bikes, parkRide, date, residentsYear, selected, onSelect, onSelectSite }: Props) {
  const cfg = useSettings();
  const t = useStrings().transit;
  const max = Math.max(...gaps.map((g) => g.score), 0.01);
  const gap = gaps.find((g) => g.district === selected);
  return (
    <div className="tab-body">
      <section className="block">
        <h3>{t.title}</h3>
        <Info>
          {t.info(metres(cfg['reach.rail']), num(cfg['transit.mainRoadShare']), whole(PER_RESIDENTS), residentsYear || t.latest, formatDay(date), cfg['transit.days'])}
        </Info>
        <div className="bar-head muted small" aria-hidden="true"><span>{t.district}</span><span>{t.need}</span><span>{t.farFromRail}</span></div>
        <ul className="bars" aria-label={t.byNeed}>
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
          <p className="muted">{t.summary(whole(gap.residents), gap.uncoveredSites.length, gap.mainRoadSites.length)}</p>
          <h4>{t.actions}</h4>
          <Actions gap={gap} pressure={pressure} bikes={bikes} parkRide={parkRide} onSelectSite={onSelectSite} />
          {gap.uncoveredSites.length > 0 && (
            <>
              <h4>{t.withoutRail}</h4>
              <ul className="plain">
                {gap.uncoveredSites.map((s) => (
                  <li key={s.id}><button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button> <span className="muted">{t.toStop(metres(s.rail.m), s.rail.name)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
