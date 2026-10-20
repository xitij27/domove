import type { Conflict, Priority, WindowAdvice } from '../model/analysis';
import { formatDay, formatShort } from '../model/days';
import type { Shift } from '../model/scenario';
import type { Site } from '../model/sites';
import { useStrings } from '../i18n';
import { Derived } from './Derived';
import { clashText, dayRange, metres, shiftText } from './format';
import { Info } from './Info';
import { SiteLink } from './SiteName';
import { ownerName, placeOf, publishedTitle, siteName } from './siteNames';
import { useSettings } from './useSettings';
import { clashWorking, freedWorking, moveWorking, priorityWorking, severityWorking } from './working';

type Props = {
  site: Site;
  /** planning role: offers moving the dates and finishing sooner */
  plan: boolean;
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
          <span className={s.id === site.id ? 'gantt-label current' : 'gantt-label'} title={publishedTitle(s) ?? s.title}>{s.hypothetical ? s.title : placeOf(s.title)}</span>
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

export function SitePanel({ site, plan, byId, conflicts, priority, advice, shift, date, today, onShift, onSelect, onBack, onRemove }: Props) {
  const cfg = useSettings();
  const t = useStrings();
  const s = t.site;
  const name = siteName(site);
  const cityText = t.siteName.cityText;
  const started = site.baseStart <= today && !site.hypothetical;
  const moved = shift?.[0] ?? 0;
  const earlier = shift?.[1] ?? 0;
  const overlapping = conflicts.map((c) => byId.get(c.a === site.id ? c.b : c.a)!).filter(Boolean);
  const cur = advice?.current;
  return (
    <div className="site-panel">
      <button className="back-button" onClick={onBack}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {s.back}
      </button>
      <h2 className="site-title">{name.place}</h2>
      {name.work && <p className="site-subtitle" lang={name.german ? 'de' : undefined}>{name.work}</p>}
      <div className="chips">
        <Derived className={`chip band ${site.band}`} how={severityWorking(site, cfg)}><i className="swatch" />{t.bands[site.band]}</Derived>
        <span className="chip">{t.kinds[site.kind]}</span>
        <span className="chip">{t.roads[site.road]}{site.roadName ? ` · ${site.roadName}` : ''}</span>
        {site.daytimeOnly && <span className="chip">{s.daytimeOnly}</span>}
        {site.openEnded && <span className="chip warn">{s.noEndDate}</span>}
        {site.hypothetical && <span className="chip">{s.proposed}</span>}
      </div>
      <dl className="facts">
        <dt>{s.owner}</dt><dd>{site.hypothetical ? s.proposedHere : ownerName(site.owner) || '–'}</dd>
        <dt>{s.district}</dt><dd>{site.district || '–'}</dd>
        <dt>{site.hypothetical ? s.dates : s.published}</dt><dd>{site.openEnded ? s.since(formatDay(site.baseStart)) : dayRange(site.baseStart, site.baseEnd)}</dd>
        {(moved !== 0 || earlier !== 0) && <><dt>{s.proposed}</dt><dd className="proposed">{dayRange(site.start, site.end)}</dd></>}
        {!site.hypothetical && <><dt>{cityText}</dt><dd className="city-text" lang="de">{site.title}</dd></>}
      </dl>

      {plan && !started && (
        <section className="block">
          <h3>{s.move}</h3>
          <label className="slider">
            <span>{moved === 0 ? s.publishedDates : `${shiftText(moved)}: ${dayRange(site.start, site.end)}`}</span>
            <input type="range" min={Math.max(-30, today + 1 - site.baseStart)} max={site.hypothetical ? 180 : 120} value={moved}
              aria-label={s.moveLabel} onChange={(e) => onShift(+e.target.value ? [+e.target.value, +e.target.value] : null)} />
          </label>
          {advice && cur && (
            <>
              <h4>{s.windows}</h4>
              <p className="muted">
                {s.now(<Derived how={clashWorking(cur, cfg)}>{clashText(cur)}</Derived>, metres(cfg['clash.radius']), cur.holidayDays)}
              </p>
              {advice.options.length === 0 && <p className="ok">{s.alreadyBest}</p>}
              <ul className="options">
                {advice.options.map((o) => (
                  <li key={o.start}>
                    <div>
                      <strong>{dayRange(o.start, o.end)}</strong> <span className="muted">({shiftText(o.shift)})</span>
                      <div className="muted">
                        {s.option(<Derived how={moveWorking(site, cur, o, cfg)}>{clashText(o)}</Derived>, o.together > 0, o.holidayDays)}
                      </div>
                      {o.afterHorizon && <div className="note">{s.afterHorizon}</div>}
                    </div>
                    <button className="button" onClick={() => onShift(o.shift ? [o.shift, o.shift] : null)}>{s.apply}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {plan && started && (
        <section className="block">
          <h3>{s.finishSooner}</h3>
          {site.openEnded ? (
            <p className="muted">{s.noEnd(ownerName(site.owner))}</p>
          ) : (
            <label className="slider">
              <span>{earlier === 0 ? s.endsAsPublished(formatDay(site.baseEnd)) : s.ends(shiftText(earlier), formatDay(site.end))}</span>
              <input type="range" min={Math.max(-90, Math.max(today, site.baseStart) - site.baseEnd)} max={30} value={earlier}
                aria-label={s.finishLabel} onChange={(e) => onShift(+e.target.value ? [0, +e.target.value] : null)} />
            </label>
          )}
          {priority && (
            <>
              <p>{s.rank(<Derived how={priorityWorking(priority.p, priority.rank, priority.of, cfg)}><strong>#{priority.rank}</strong></Derived>, priority.of, formatDay(date))}</p>
              <div className="chips">{priority.p.reasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div>
              {priority.p.freedOverlapDays > 0 && (
                <p className="muted">{s.freed(cfg['priority.sooner'], <Derived how={freedWorking(priority.p, cfg)}>{t.n.day(priority.p.freedOverlapDays)}</Derived>)}</p>
              )}
            </>
          )}
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="block">
          <h3>{s.coincide}</h3>
          <Info>{s.coincideInfo(metres(cfg['together.radius']))}</Info>
          <MiniGantt site={site} others={overlapping} date={date} />
          <ul className="plain">
            {conflicts.map((c) => {
              const other = byId.get(c.a === site.id ? c.b : c.a);
              if (!other) return null;
              return (
                <li key={other.id}>
                  <SiteLink site={other} onSelect={onSelect} />
                  <div className="muted">
                    {c.type === 'bundle' ? s.sameStretch(metres(c.m), c.days) : s.away(metres(c.m), c.days, dayRange(c.from, c.to))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="block">
        <h3>{s.waysAround}</h3>
        <Info>{s.waysInfo}</Info>
        <dl className="facts">
          <dt>{s.stadtbahn}</dt><dd>{site.rail.name ? `${site.rail.name} (${site.rail.detail || s.stop}), ${metres(site.rail.m)}` : '–'}</dd>
          {site.stop && <><dt>{s.busTram}</dt><dd>{[site.stop.name, metres(site.stop.m)].filter(Boolean).join(', ')}</dd></>}
          {site.station && <><dt>{s.station}</dt><dd>{[site.station.name, metres(site.station.m)].filter(Boolean).join(', ')}</dd></>}
          <dt>{s.fire}</dt><dd>{site.fire.name ? `${site.fire.name}, ${metres(site.fire.m)}` : '–'}</dd>
          <dt>{s.hospital}</dt><dd>{site.hospital.name ? `${site.hospital.name}, ${metres(site.hospital.m)}` : '–'}</dd>
        </dl>
      </section>
      {site.hypothetical && <button className="button danger" onClick={onRemove}>{s.remove}</button>}
    </div>
  );
}
