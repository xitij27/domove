import { DEFAULT_PARAMS, LOAD_SCALE } from '../model/capacity';
import type { CapacityResult, Params } from '../model/capacity';
import { formatDay } from '../model/days';
import { plural, shortTitle } from './format';
import { Info } from './Info';

type Props = {
  result: CapacityResult;
  params: Params;
  date: number;
  selected: string | null;
  onParams: (p: Params) => void;
  onSelect: (name: string | null) => void;
  onSelectSite: (id: string) => void;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;

function Slider({ label, value, min, max, step, text, onChange }: { label: string; value: number; min: number; max: number; step: number; text: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label}: <strong>{text}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function CapacityTab({ result, params, date, selected, onParams, onSelect, onSelectSite }: Props) {
  const rows = result.districts.filter((d) => d.load !== null);
  const row = rows.find((d) => d.district === selected);
  const changed = params.population !== 1 || params.carUse !== 1;
  return (
    <div className="tab-body">
      <section className="block">
        <h3>What the roads can take</h3>
        <Info>
          A relative model, not a traffic count: the city publishes no traffic volumes. Each district gets the lane-kilometres of its main roads
          (4 lanes on main and connecting roads, 2 on other through streets). Demand follows where people live (60%) and where the roads are
          (40%, through traffic). The works running on {formatDay(date)} take lanes off their district's roads. "Road use today" is the one
          assumption: how full the whole network is at the busy hour with no works. Change it to match what you know.
        </Info>
        <p className="lead">
          {result.over > 0
            ? <>{plural(result.over, 'district')} over capacity on {formatDay(date)}.</>
            : <>No district over capacity on {formatDay(date)}.</>}
          {' '}{result.headroom < 0
            ? <>{result.firstFull} is full even at today's levels; it would need <strong>{signed(result.headroom)}</strong> fewer cars to fit.</>
            : <>The city can take about <strong>{signed(result.headroom)}</strong> more people and cars before {result.firstFull ?? 'a district'} is full.</>}
        </p>
        <Slider label="Residents" value={params.population} min={0.7} max={1.5} step={0.01} text={signed(params.population - 1)} onChange={(population) => onParams({ ...params, population })} />
        <Slider label="Car trips per resident" value={params.carUse} min={0.6} max={1.4} step={0.01} text={signed(params.carUse - 1)} onChange={(carUse) => onParams({ ...params, carUse })} />
        <Slider label="Road use today (assumption)" value={params.useToday} min={0.4} max={0.95} step={0.01} text={pct(params.useToday)} onChange={(useToday) => onParams({ ...params, useToday })} />
        <p className="muted small">
          Whole network at the busy hour: <strong>{pct(result.citywide)}</strong> full.
          {changed && <> <button className="link-button" onClick={() => onParams({ ...params, population: 1, carUse: 1 })}>Back to today's levels</button></>}
          {params.useToday !== DEFAULT_PARAMS.useToday && <> <button className="link-button" onClick={() => onParams({ ...params, useToday: DEFAULT_PARAMS.useToday })}>Reset assumption</button></>}
        </p>
        <div className="bar-head muted small" aria-hidden="true"><span>District</span><span>Road load (full = 100%)</span><span>From works</span></div>
        <ul className="bars" aria-label="Districts by road load">
          {rows.map((d) => (
            <li key={d.district}>
              <button className={d.district === selected ? 'bar-row selected' : 'bar-row'} onClick={() => onSelect(d.district === selected ? null : d.district)} aria-pressed={d.district === selected}>
                <span className="bar-label">{d.district}</span>
                <span className="bar-track"><span className={d.load! >= 1 ? 'bar over' : 'bar'} style={{ width: `${Math.min(100, (d.load! / LOAD_SCALE) * 100)}%` }} /></span>
                <span className="bar-value">{pct(d.load!)}{d.lost > 0 && d.loadWithoutWorks !== null ? ` (+${Math.round((d.load! - d.loadWithoutWorks) * 100)})` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {row && (
        <section className="block">
          <h3>{row.district}</h3>
          <p className="muted">
            {row.residents.toLocaleString('en-GB')} residents · {Math.round(row.capacity)} lane-km of main road
            · works take {Math.round((row.lost / row.capacity) * 100)}% of it · room for {signed(row.headroom ?? 0)} more people and cars
          </p>
          {row.sites.length > 0 ? (
            <>
              <h4>Works running on {formatDay(date)}</h4>
              <ul className="plain">
                {row.sites.map((s) => (
                  <li key={s.id}><button className="link-button" title={s.title} onClick={() => onSelectSite(s.id)}>{shortTitle(s.title)}</button></li>
                ))}
              </ul>
            </>
          ) : <p className="ok">No works running here on this day.</p>}
        </section>
      )}
    </div>
  );
}
