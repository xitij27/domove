import { useStrings, whole } from '../i18n';
import { DEFAULT_PARAMS, LOAD_SCALE } from '../model/capacity';
import type { CapacityResult, Params } from '../model/capacity';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { pct, shortTitle, signed } from './format';
import { Info } from './Info';
import { Slider } from './Slider';
import { useSettings } from './useSettings';
import { citywideWorking, loadWorking, roomWorking, worksShareWorking } from './working';

type Props = {
  result: CapacityResult;
  params: Params;
  date: number;
  selected: string | null;
  onParams: (p: Params) => void;
  onSelect: (name: string | null) => void;
  onSelectSite: (id: string) => void;
};

export function CapacityTab({ result, params, date, selected, onParams, onSelect, onSelectSite }: Props) {
  const cfg = useSettings();
  const t = useStrings().capacity;
  const rows = result.districts.filter((d) => d.load !== null);
  const row = rows.find((d) => d.district === selected);
  const changed = params.population !== 1 || params.carUse !== 1;
  return (
    <div className="tab-body">
      <section className="block">
        <h3>{t.title}</h3>
        <Info>
          {t.info(cfg['capacity.roadLanes.main'], cfg['capacity.roadLanes.other'], pct(1 - cfg['capacity.through']), pct(cfg['capacity.through']), formatDay(date))}
        </Info>
        <p className="lead">
          {result.over > 0 ? t.over(result.over, formatDay(date)) : t.noneOver(formatDay(date))}
          {' '}{result.headroom < 0
            ? t.fullToday(result.firstFull ?? '', <Derived how={roomWorking(rows[0], params)}><strong>{signed(result.headroom)}</strong></Derived>)
            : t.room(<Derived how={rows[0] ? roomWorking(rows[0], params) : []}><strong>{signed(result.headroom)}</strong></Derived>, result.firstFull)}
        </p>
        <Slider label={t.residents} value={params.population} min={0.7} max={1.5} step={0.01} text={signed(params.population - 1)} onChange={(population) => onParams({ ...params, population })} />
        <Slider label={t.carTrips} value={params.carUse} min={0.6} max={1.4} step={0.01} text={signed(params.carUse - 1)} onChange={(carUse) => onParams({ ...params, carUse })} />
        <Slider label={t.roadUse} value={params.useToday} min={0.4} max={0.95} step={0.01} text={pct(params.useToday)} onChange={(useToday) => onParams({ ...params, useToday })} />
        <p className="muted small">
          {t.network(<Derived how={citywideWorking(result, params)}><strong>{pct(result.citywide)}</strong></Derived>)}
          {changed && <> <button className="link-button" onClick={() => onParams({ ...params, population: 1, carUse: 1 })}>{t.backToToday}</button></>}
          {params.useToday !== DEFAULT_PARAMS.useToday && <> <button className="link-button" onClick={() => onParams({ ...params, useToday: DEFAULT_PARAMS.useToday })}>{t.resetAssumption}</button></>}
        </p>
        <div className="bar-head muted small" aria-hidden="true"><span>{t.district}</span><span>{t.load}</span><span>{t.fromWorks}</span></div>
        <ul className="bars" aria-label={t.byLoad}>
          {rows.map((d) => (
            <li key={d.district} className={d.district === selected ? 'bar-row selected' : 'bar-row'}>
              <button className="bar-pick" onClick={() => onSelect(d.district === selected ? null : d.district)} aria-pressed={d.district === selected}>
                <span className="bar-label">{d.district}</span>
                <span className="bar-track"><span className={d.load! >= 1 ? 'bar over' : 'bar'} style={{ width: `${Math.min(100, (d.load! / LOAD_SCALE) * 100)}%` }} /></span>
              </button>
              <span className="bar-value">
                <Derived how={loadWorking(d, result, params, cfg)}>{pct(d.load!)}{d.lost > 0 && d.loadWithoutWorks !== null ? ` (+${Math.round((d.load! - d.loadWithoutWorks) * 100)})` : ''}</Derived>
              </span>
            </li>
          ))}
        </ul>
      </section>
      {row && (
        <section className="block">
          <h3>{row.district}</h3>
          <p className="muted">
            {t.row(whole(row.residents), Math.round(row.capacity),
              <Derived how={worksShareWorking(row, cfg)}>{pct(row.lost / row.capacity)}</Derived>,
              <Derived how={roomWorking(row, params)}>{signed(row.headroom ?? 0)}</Derived>)}
          </p>
          {row.sites.length > 0 ? (
            <>
              <h4>{t.worksOn(formatDay(date))}</h4>
              <ul className="plain">
                {row.sites.map((s) => (
                  <li key={s.id}><button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button></li>
                ))}
              </ul>
            </>
          ) : <p className="ok">{t.noWorks}</p>}
        </section>
      )}
    </div>
  );
}
