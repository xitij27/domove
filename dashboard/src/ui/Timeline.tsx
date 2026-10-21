// Construction sites running each day, stacked by how much each disrupts, over the days the city's data covers.
// Also the dashboard's day picker: tap, click or drag a day, or use the arrow keys.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStrings } from '../i18n';
import type { LoadPoint } from '../model/analysis';
import { formatDay, formatMonth, formatShort } from '../model/days';
import type { Band } from '../model/settings';
import { dayRange, num } from './format';
import { busiest, chartRange, countMax, dayTicks, weekRows } from './timelineScale';

type Holiday = { start: number; end: number; name: string };
type Props = {
  /** Every day the dashboard covers; the chart shows the part the data can speak for. */
  load: LoadPoint[];
  /** The published plans, while the scenario changes them. */
  published: LoadPoint[] | null;
  holidays: Holiday[];
  today: number;
  date: number;
  /** The last start of a published planned work: no later works are known. */
  horizon: number | null;
  /** Starts of the works the scenario moved or added, so the chart reaches them. */
  moved: number[];
  onDate: (day: number) => void;
  outlookPeriod?: { from: number; to: number } | null;
  /** A phone's screen: the chart sits under the day picker and is taller. */
  narrow?: boolean;
};

// Bottom up: the sites that disrupt most stand on the baseline.
const BANDS: Band[] = ['high', 'medium', 'low'];
const PAD = { top: 20, right: 10, bottom: 24, left: 34 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
// How far a finger has to move sideways before it drags the day rather than scrolling the page.
const DRAG_SLOP = 6;
// Room the "today" label keeps clear of the axis labels beside it.
const TODAY_ROOM = 44;
// Width of a zone label's letter at its 10px size, to tell whether it fits.
const LETTER = 5.8;

/** A bar segment from `top` down to `bottom`; the top of a stack gets rounded corners, its foot stays square. */
function segment(x: number, w: number, top: number, bottom: number, round: boolean): string {
  const r = round ? Math.min(RADIUS, w / 2, bottom - top) : 0;
  const f = (n: number) => n.toFixed(1);
  return r > 0.5
    ? `M${f(x)},${f(bottom)}V${f(top + r)}A${f(r)},${f(r)} 0 0 1 ${f(x + r)},${f(top)}H${f(x + w - r)}A${f(r)},${f(r)} 0 0 1 ${f(x + w)},${f(top + r)}V${f(bottom)}Z`
    : `M${f(x)},${f(bottom)}V${f(top)}H${f(x + w)}V${f(bottom)}Z`;
}

export function Timeline({ load, published, holidays, today, date, horizon, moved, onDate, outlookPeriod, narrow }: Props) {
  const words = useStrings();
  const t = words.timeline;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  // A finger that went down and hasn't yet said whether it taps, drags or scrolls.
  const touch = useRef<number | null>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  // While dragging back from a day before today, the chart keeps those days rather than shifting under the finger.
  const [heldFrom, setHeldFrom] = useState<number | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(wrap.current!);
    return () => observer.disconnect();
  }, []);

  const first = load[0].day;
  const last = load[load.length - 1].day;
  const range = chartRange({ today, date, horizon, moved, min: first, max: last });
  const from = Math.min(range.from, heldFrom ?? range.from);
  const to = range.to;
  const at = (day: number) => load[Math.min(load.length - 1, Math.max(0, day - first))];
  const points = load.slice(from - first, to - first + 1);
  const publishedPoints = published?.slice(from - first, to - first + 1) ?? null;

  const H = narrow ? 150 : 120;
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const step = plotW / (to - from + 1);
  // wide days leave air between their bars; narrow ones keep a gap of a px or two, the narrowest none
  const barW = step >= 8 ? Math.min(MAX_BAR, step * 0.7) : step - (step >= 6 ? GAP : step >= 3 ? 1 : 0);
  const left = (day: number) => PAD.left + (day - from) * step;
  const mid = (day: number) => left(day) + step / 2;
  // headroom over the tallest bar for its label
  const max = countMax(Math.max(...points.map((p) => p.count.total), ...(publishedPoints ?? []).map((p) => p.count.total)) * 1.12);
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const unit = plotH / max;

  // Days the chart shows only part of: before today the ended works are gone, after the plans end new ones are unknown.
  const past = from < today ? { start: from, end: today - 1, label: t.endedMissing } : null;
  const plansEnd = horizon === null ? null : Math.max(horizon, today);
  const later = plansEnd !== null && plansEnd < to ? { start: plansEnd + 1, end: to, label: t.notPublished } : null;
  const partial = (day: number) => day < today || (later !== null && day >= later.start);
  const peak = points.length ? busiest(points) : null;
  const zones = [past, later].flatMap((z) => {
    if (!z) return [];
    const w = (z.end - z.start + 1) * step;
    const peakInside = peak !== null && peak.day >= z.start && peak.day <= z.end;
    // each label keeps to the zone's far side, away from the days with full data and the busiest day's label
    const end = z === later;
    return [{ ...z, x: left(z.start), w, end, labelled: !peakInside && w >= z.label.length * LETTER + 8 }];
  });

  const ticks = dayTicks(from, to, step).filter((tick) => today < from || today > to || Math.abs(mid(tick.day) - mid(today)) >= TODAY_ROOM);
  const tickLabel = (day: number, kind: 'week' | 'month') => {
    if (kind === 'week') return formatShort(day);
    const d = new Date(day * 86_400_000);
    return d.getUTCMonth() === 0 ? `${formatMonth(day)} ${d.getUTCFullYear()}` : formatMonth(day);
  };
  const shownHolidays = holidays.filter((h) => h.end >= from && h.start <= to);

  const dayAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.min(to, Math.max(from, from + Math.floor((clientX - r.left - PAD.left) / step)));
  };
  const startDrag = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    setHeldFrom(from);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const endDrag = () => {
    touch.current = null;
    dragging.current = false;
    setHeldFrom(null);
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    // A finger may be starting to scroll the page, so it picks a day only once it taps or moves sideways.
    if (e.pointerType !== 'mouse') {
      touch.current = e.clientX;
      return;
    }
    startDrag(e);
    onDate(dayAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') setHover(dayAt(e.clientX));
    else if (touch.current !== null && !dragging.current && Math.abs(e.clientX - touch.current) > DRAG_SLOP) startDrag(e);
    if (dragging.current) onDate(dayAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (touch.current !== null && !dragging.current) onDate(dayAt(e.clientX));
    endDrag();
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const move = { ArrowLeft: -1, ArrowRight: 1, PageDown: -7, PageUp: 7 }[e.key];
    if (move) onDate(Math.min(last, Math.max(first, date + move)));
    else if (e.key === 'Home') onDate(today);
    else return;
    e.preventDefault();
  };

  // The readout follows the pointer, else the day picked.
  const shown = at(hover ?? date);
  const shownPublished = publishedPoints && published ? published[shown.day - first] : null;
  const shownHoliday = holidays.find((h) => h.start <= shown.day && shown.day <= h.end);

  return (
    <section className={narrow ? 'timeline narrow' : 'timeline'} aria-label={t.label}>
      <div className="timeline-head">
        <h2>{t.title}</h2>
        <span className="keys">
          {BANDS.map((band) => <span key={band} className="key"><i className={`key-swatch ${band}`} />{t[band]}</span>)}
          {published && <span className="key"><i className="key-line published" />{t.published}</span>}
          {shownHolidays.length > 0 && <span className="key"><i className="key-strip" />{t.holidays}</span>}
          {outlookPeriod && <span className="key"><i className="key-band outlook-key" />{t.outlookWindow}</span>}
        </span>
      </div>
      <p className="timeline-readout">
        {/* groups that wrap whole, so no separator starts a line */}
        <span>
          <span className="readout-day">{formatDay(shown.day)}{shown.day === today ? words.app.todaySuffix : ''}</span>
          {t.sites(<strong>{shown.count.total}</strong>, shown.count.total)}
        </span>
        <span className="muted">
          {[t.split(shown.count.high, shown.count.medium, shown.count.low), t.points(num(shown.total, 1)), shownHoliday?.name].filter(Boolean).join(' · ')}
        </span>
        {shownPublished && <span><i className="key-line published" />{t.publishedSites(<strong>{shownPublished.count.total}</strong>)}</span>}
      </p>
      <div className="timeline-plot" ref={wrap}>
        <svg
          ref={svg}
          width={width}
          height={H}
          role="slider"
          tabIndex={0}
          aria-label={t.slider}
          aria-valuemin={first}
          aria-valuemax={last}
          aria-valuenow={date}
          aria-valuetext={t.valueText(formatDay(date), at(date).count.total)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {zones.map((z) => <rect key={z.start} className="zone" x={z.x} y={PAD.top} width={z.w} height={plotH} />)}
          {outlookPeriod && outlookPeriod.to >= from && outlookPeriod.from <= to && (
            <rect className="outlook-window" x={left(Math.max(from, outlookPeriod.from))} y={PAD.top}
              width={(Math.min(to, outlookPeriod.to) - Math.max(from, outlookPeriod.from) + 1) * step} height={plotH} />
          )}
          {hover !== null && <rect className="hover-column" x={left(hover)} y={PAD.top} width={step} height={plotH} />}
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line className="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(max * f)} y2={y(max * f)} />
              <text className="tick" x={PAD.left - 6} y={y(max * f) + 3} textAnchor="end">{max * f}</text>
            </g>
          ))}
          <text className="tick" x={PAD.left - 6} y={base + 3} textAnchor="end">0</text>
          <line className="selected" x1={mid(date)} x2={mid(date)} y1={PAD.top - 2} y2={base} />
          {points.map((p) => {
            const x = left(p.day) + (step - barW) / 2;
            let foot = base;
            const parts = BANDS.filter((band) => p.count[band] > 0).map((band, i) => {
              const top = foot - p.count[band] * unit;
              // a surface gap between stacked segments, where the segment is tall enough to keep it
              const bottom = i > 0 && foot - top > GAP + 1 ? foot - GAP : foot;
              foot = top;
              return { band, top, bottom };
            });
            return parts.length ? (
              <g key={p.day} className={partial(p.day) ? 'day partial' : 'day'}>
                {parts.map((s, i) => <path key={s.band} className={`bar ${s.band}`} d={segment(x, barW, s.top, s.bottom, i === parts.length - 1)} />)}
              </g>
            ) : null;
          })}
          {publishedPoints && (
            <path className="published-line" d={publishedPoints.map((p, i) =>
              `${i ? 'V' : `M${left(p.day).toFixed(1)},`}${y(p.count.total).toFixed(1)}H${(left(p.day) + step).toFixed(1)}`).join('')} />
          )}
          <line className="axis" x1={PAD.left} x2={PAD.left + plotW} y1={base} y2={base} />
          {zones.filter((z) => z.labelled).map((z) => (
            <text key={z.start} className="zone-label" x={z.end ? z.x + z.w - 4 : z.x + 4} textAnchor={z.end ? 'end' : 'start'} y={PAD.top + 10}>{z.label}</text>
          ))}
          {peak && peak.count.total > 0 && (
            <text className="peak-label" textAnchor="middle" y={y(peak.count.total) - 5}
              x={Math.min(PAD.left + plotW - 8, Math.max(PAD.left + 8, mid(peak.day)))}>{peak.count.total}</text>
          )}
          {shownHolidays.map((h) => {
            const a = Math.max(h.start, from);
            return <rect key={h.start} className="holiday" x={left(a)} y={base + 3} width={(Math.min(h.end, to) - a + 1) * step} height={4} />;
          })}
          {ticks.map((tick) => (
            <g key={tick.day}>
              <line className="axis" x1={mid(tick.day)} x2={mid(tick.day)} y1={base} y2={base + 3} />
              <text className="tick" textAnchor="middle" y={H - 5}
                x={Math.min(PAD.left + plotW - 16, Math.max(PAD.left + 16, mid(tick.day)))}>{tickLabel(tick.day, tick.kind)}</text>
            </g>
          ))}
          {today >= from && today <= to && (
            <text className="tick today-label" y={H - 5} textAnchor={today === from ? 'start' : 'middle'}
              x={today === from ? left(today) : mid(today)}>{words.app.today}</text>
          )}
          <path className="caret" d={`M${(mid(date) - 4).toFixed(1)},${base + 9}L${mid(date).toFixed(1)},${base + 3}L${(mid(date) + 4).toFixed(1)},${base + 9}Z`} />
        </svg>
      </div>
      <p className="timeline-note">
        {[
          peak && peak.count.total > 0 ? t.busiest(formatShort(peak.day), peak.count.total) : null,
          later && horizon !== null ? t.plansEnd(formatShort(horizon)) : null,
          past ? t.pastMissing : null,
          t.pick,
        ].filter(Boolean).join(' ')}
      </p>
      <details className="table-view">
        <summary>{t.table}</summary>
        <table>
          <thead><tr><th>{t.week}</th><th>{t.busiestDay}</th><th>{t.sitesColumn}</th><th>{t.highColumn}</th><th>{t.pointsColumn}</th></tr></thead>
          <tbody>
            {weekRows(points).map((w) => (
              <tr key={w.from}>
                <td>{dayRange(w.from, w.to)}</td><td>{formatShort(w.peak.day)}</td><td>{w.peak.count.total}</td><td>{w.peak.count.high}</td><td>{num(w.peak.total, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">{t.pointsHow}</p>
      </details>
    </section>
  );
}
