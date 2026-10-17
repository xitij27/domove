import type { Conflict, Priority, WindowAdvice } from '../model/analysis';
import { KIND_LABEL } from '../model/closures';
import { formatDay, formatShort } from '../model/days';
import type { Shift } from '../model/scenario';
import { ROAD_LABEL } from '../model/sites';
import type { Site } from '../model/sites';
import { Derived } from './Derived';
import { clashText, dayRange, metres, plural, shiftText } from './format';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { clashWorking, freedWorking, moveWorking, priorityWorking, severityWorking } from './working';

type Props = {
  site: Site;
  byId: Map<string, Site>;
  conflicts: Conflict[];
  priority: { rank: number; of: number; p: Priority } | null;
  advice: WindowAdvice | null;
  shift: Shift | undefined;
  date: number;
  today: number;
  onShift: (shift: Shift | null) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onRemove: () => void;
};

const BAND_LABEL = { high: 'High disruption', medium: 'Medium disruption', low: 'Low disruption' };

/** Bars for the site and the works it overlaps, so the planner sees when they coincide. */
function MiniGantt({ site, others, date }: { site: Site; others: Site[]; date: number }) {
  const rows = [site, ...others];
  const from = Math.max(Math.min(...rows.map((s) => s.start)), date - 120) - 3;
  const to = Math.min(Math.max(...rows.map((s) => s.end)), date + 240) + 3;
  const pct = (d: number) => `${(Math.min(Math.max(d, from), to) - from) / (to - from) * 100}%`;
  return (
    <div className="gantt" role="list">
      {rows.map((s) => (
        <div className="gantt-row" role="listitem" key={s.id}>
          <span className={s.id === site.id ? 'gantt-label current' : 'gantt-label'} title={s.title}>{s.title}</span>
          <span className="gantt-track">
            <span
              className={`gantt-bar ${s.band}${s.id === site.id ? ' current' : ''}`}
              style={{ left: pct(s.start), width: `calc(${pct(s.end + 1)} - ${pct(s.start)})` }}
              title={dayRange(s.start, s.end)}
            />
            {date >= from && date <= to && <span className="gantt-date" style={{ left: pct(date) }} />}
          </span>
        </div>
      ))}
      <div className="gantt-axis"><span>{formatShort(from)}</span><span>{formatShort(to)}</span></div>
    </div>
  );
}

export function SitePanel({ site, byId, conflicts, priority, advice, shift, date, today, onShift, onSelect, onBack, onRemove }: Props) {
  const cfg = useSettings();
  const started = site.baseStart <= today && !site.hypothetical;
  const moved = shift?.[0] ?? 0;
  const earlier = shift?.[1] ?? 0;
  const overlapping = conflicts.map((c) => byId.get(c.a === site.id ? c.b : c.a)!).filter(Boolean);
  const cur = advice?.current;
  return (
    <div className="site-panel">
      <button className="back-button" onClick={onBack}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </button>
      <h2 className="site-title">{site.title}</h2>
      <div className="chips">
        <Derived className={`chip band ${site.band}`} how={severityWorking(site, cfg)}><i className="swatch" />{BAND_LABEL[site.band]}</Derived>
        <span className="chip">{KIND_LABEL[site.kind]}</span>
        <span className="chip">{ROAD_LABEL[site.road]}{site.roadName ? ` · ${site.roadName}` : ''}</span>
        {site.daytimeOnly && <span className="chip">Daytime only</span>}
        {site.openEnded && <span className="chip warn">No end date</span>}
        {site.hypothetical && <span className="chip">Proposed</span>}
      </div>
      <dl className="facts">
        <dt>Owner</dt><dd>{site.hypothetical ? 'Proposed in this scenario' : site.owner || '–'}</dd>
        <dt>District</dt><dd>{site.district || '–'}</dd>
        <dt>{site.hypothetical ? 'Dates' : 'Published'}</dt><dd>{site.openEnded ? `since ${formatDay(site.baseStart)}` : dayRange(site.baseStart, site.baseEnd)}</dd>
        {(moved !== 0 || earlier !== 0) && <><dt>Proposed</dt><dd className="proposed">{dayRange(site.start, site.end)}</dd></>}
      </dl>

      {!started && (
        <section className="block">
          <h3>Move the works</h3>
          <label className="slider">
            <span>{moved === 0 ? 'Published dates' : `${shiftText(moved)}: ${dayRange(site.start, site.end)}`}</span>
            <input type="range" min={Math.max(-30, today + 1 - site.baseStart)} max={site.hypothetical ? 180 : 120} value={moved}
              aria-label="Days to move the works" onChange={(e) => onShift(+e.target.value ? [+e.target.value, +e.target.value] : null)} />
          </label>
          {advice && cur && (
            <>
              <h4>Best windows nearby</h4>
              <p className="muted">
                Now: clashes <Derived how={clashWorking(cur, cfg)}>{clashText(cur)}</Derived> with serious works within {metres(cfg['clash.radius'])}
                {cur.holidayDays ? `, ${plural(cur.holidayDays, 'day')} in school holidays` : ''}.
              </p>
              {advice.options.length === 0 && <p className="ok">These dates are already the best within the next three months.</p>}
              <ul className="options">
                {advice.options.map((o) => (
                  <li key={o.start}>
                    <div>
                      <strong>{dayRange(o.start, o.end)}</strong> <span className="muted">({shiftText(o.shift)})</span>
                      <div className="muted">
                        Clashes <Derived how={moveWorking(site, cur, o, cfg)}>{clashText(o)}</Derived>
                        {o.together > 0 ? ' · together with works on the same stretch' : ''}
                        {o.holidayDays ? ` · ${plural(o.holidayDays, 'day')} in school holidays` : ''}
                      </div>
                      {o.afterHorizon && <div className="note">After the published plans end: later works aren't known yet.</div>}
                    </div>
                    <button className="button" onClick={() => onShift(o.shift ? [o.shift, o.shift] : null)}>Apply</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {started && (
        <section className="block">
          <h3>Finish sooner</h3>
          {site.openEnded ? (
            <p className="muted">The feed gives no end date. Ask {site.owner || 'the owner'} for one before planning around it.</p>
          ) : (
            <label className="slider">
              <span>{earlier === 0 ? `Ends ${formatDay(site.baseEnd)} as published` : `${shiftText(earlier)}: ends ${formatDay(site.end)}`}</span>
              <input type="range" min={Math.max(-90, Math.max(today, site.baseStart) - site.baseEnd)} max={30} value={earlier}
                aria-label="Days to finish earlier or later" onChange={(e) => onShift(+e.target.value ? [0, +e.target.value] : null)} />
            </label>
          )}
          {priority && (
            <>
              <p><Derived how={priorityWorking(priority.p, priority.rank, priority.of, cfg)}><strong>#{priority.rank}</strong></Derived> of {priority.of} running sites to speed up on {formatDay(date)}.</p>
              <div className="chips">{priority.p.reasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div>
              {priority.p.freedOverlapDays > 0 && (
                <p className="muted">Finishing {cfg['priority.sooner']} days earlier removes <Derived how={freedWorking(priority.p, cfg)}>{plural(priority.p.freedOverlapDays, 'day')}</Derived> of overlap with works nearby.</p>
              )}
            </>
          )}
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="block">
          <h3>Works that coincide</h3>
          <Info>Distances run between the edges of the two works. Days count from today, only those on which both run. Works within {metres(cfg['together.radius'])} are on the same stretch.</Info>
          <MiniGantt site={site} others={overlapping} date={date} />
          <ul className="plain">
            {conflicts.map((c) => {
              const other = byId.get(c.a === site.id ? c.b : c.a);
              if (!other) return null;
              return (
                <li key={other.id}>
                  <button className="link-button" onClick={() => onSelect(other.id)}>{other.title}</button>
                  <div className="muted">
                    {c.type === 'bundle'
                      ? `Same stretch (${metres(c.m)}), ${plural(c.days, 'day')} apart: better done together`
                      : `${metres(c.m)} away, both running ${plural(c.days, 'day')} (${dayRange(c.from, c.to)})`}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="block">
        <h3>Ways around it</h3>
        <Info>The nearest Stadtbahn stop, fire and rescue station and hospital in the city's open data, in a straight line from the edge of the works.</Info>
        <dl className="facts">
          <dt>Stadtbahn</dt><dd>{site.rail.name ? `${site.rail.name} (${site.rail.detail || 'stop'}), ${metres(site.rail.m)}` : '–'}</dd>
          <dt>Fire &amp; rescue</dt><dd>{site.fire.name ? `${site.fire.name}, ${metres(site.fire.m)}` : '–'}</dd>
          <dt>Hospital</dt><dd>{site.hospital.name ? `${site.hospital.name}, ${metres(site.hospital.m)}` : '–'}</dd>
        </dl>
      </section>
      {site.hypothetical && <button className="button danger" onClick={onRemove}>Remove this proposed project</button>}
    </div>
  );
}
