import type { DistrictGap, StopPressure } from '../model/analysis';
import { poisNear } from '../model/analysis';
import type { Poi } from '../data/sources';
import { useStrings, whole } from '../i18n';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { metres, num, shortTitle } from './format';
import { Info } from './Info';
import { SiteLink } from './SiteName';
import { useSettings } from './useSettings';
import { transitWorking } from './working';

type Props = {
  gaps: DistrictGap[];
  pressure: StopPressure[];
  bikes: Poi[];
  parkRide: Poi[];
  date: number;
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
        {t.boost(<button className="link-button" onClick={() => onSelectSite(worst.id)}>{shortTitle(worst.title)}</button>, worst.stop ? metres(worst.stop.m) : '–', worst.stop?.name ?? '')}
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

export function TransitTab({ gaps, pressure, bikes, parkRide, date, selected, onSelect, onSelectSite }: Props) {
  const cfg = useSettings();
  const t = useStrings().transit;
  const max = Math.max(...gaps.map((g) => g.cutOff), 1);
  const gap = gaps.find((g) => g.district === selected);
  return (
    <div className="tab-body">
      <section className="block">
        <h3>{t.title}</h3>
        <Info>
          {t.info(metres(cfg['reach.stop']), metres(cfg['reach.station']), metres(cfg['transit.near']), num(cfg['clash.minSeverity']), formatDay(date), cfg['transit.days'])}
        </Info>
        <div className="bar-head muted small" aria-hidden="true"><span>{t.district}</span><span>{t.need}</span><span>{t.farFromRail}</span></div>
        <ul className="bars" aria-label={t.byNeed}>
          {gaps.map((g) => (
            <li key={g.district} className={g.district === selected ? 'bar-row selected' : 'bar-row'}>
              <button className="bar-pick" onClick={() => onSelect(g.district === selected ? null : g.district)} aria-pressed={g.district === selected}>
                <span className="bar-label">{g.district}</span>
                <span className="bar-track">{g.cutOff > 0 && <span className="bar" style={{ width: `${(g.cutOff / max) * 100}%` }} />}</span>
              </button>
              <span className="bar-value"><Derived how={transitWorking(g, cfg)}>{whole(g.cutOff)}</Derived></span>
            </li>
          ))}
        </ul>
      </section>
      {gap && (
        <section className="block">
          <h3>{gap.district}</h3>
          <p className="muted">{t.summary(whole(gap.residents), whole(gap.cutOff), gap.uncoveredSites.length, gap.mainRoadSites.length)}</p>
          <h4>{t.actions}</h4>
          <Actions gap={gap} pressure={pressure} bikes={bikes} parkRide={parkRide} onSelectSite={onSelectSite} />
          {gap.uncoveredSites.length > 0 && (
            <>
              <h4>{t.withoutRail}</h4>
              <ul className="plain">
                {gap.uncoveredSites.map((s) => (
                  <li key={s.id}><SiteLink site={s} onSelect={onSelectSite} /> <span className="muted">{s.stop && t.toStop(metres(s.stop.m), s.stop.name)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
