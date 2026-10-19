// Citywide disruption load per day: the scenario as a single-series area, the published plans as a grey line.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStrings } from '../i18n';
import type { LoadPoint } from '../model/analysis';
import { formatDay, formatMonth, formatShort, monthStart, nextMonth } from '../model/days';
import { one } from './format';

type Holiday = { start: number; end: number; name: string };
type Props = {
  load: LoadPoint[];
  published: LoadPoint[] | null;
  holidays: Holiday[];
  today: number;
  date: number;
  horizon: number | null;
  onDate: (day: number) => void;
  outlookPeriod?: { from: number; to: number } | null;
};

const H = 100;
const PAD = { top: 18, right: 10, bottom: 22, left: 34 };

/** 1, 2 or 5 times a power of ten, just above the value. */
function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function Timeline({ load, published, holidays, today, date, horizon, onDate, outlookPeriod }: Props) {
  const words = useStrings();
  const t = words.timeline;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(wrap.current!);
    return () => observer.disconnect();
  }, []);

  const from = load[0].day;
  const to = load[load.length - 1].day;
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...load.map((p) => p.total), ...(published ?? []).map((p) => p.total)) * 1.05);
  const x = (day: number) => PAD.left + ((day - from) / (to - from)) * plotW;
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const path = (pts: LoadPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.total).toFixed(1)}`).join('');
  const at = (day: number) => load[Math.min(load.length - 1, Math.max(0, day - from))];

  const months = useMemo(() => {
    const out: number[] = [];
    for (let m = monthStart(from) < from ? nextMonth(from) : from; m <= to; m = nextMonth(m)) out.push(m);
    return out;
  }, [from, to]);
  const monthly = useMemo(() => months.map((m) => {
    const days = load.filter((p) => p.day >= m && p.day < nextMonth(m));
    const peak = days.reduce((a, b) => (b.total > a.total ? b : a), days[0]);
    return { m, average: days.reduce((sum, p) => sum + p.total, 0) / days.length, peak };
  }), [months, load]);

  const dayAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return Math.min(to, Math.max(from, Math.round(from + ((clientX - r.left - PAD.left) / plotW) * (to - from))));
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onDate(dayAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const day = dayAt(e.clientX);
    setHover(day);
    if (dragging.current) onDate(day);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -7, PageUp: 7 }[e.key];
    if (step) onDate(Math.min(to, Math.max(from, date + step)));
    else if (e.key === 'Home') onDate(today);
    else return;
    e.preventDefault();
  };

  const hovered = hover === null ? null : at(hover);
  const hoveredPublished = hover === null || !published ? null : published[hover - from];
  const hoveredHoliday = hover === null ? undefined : holidays.find((h) => h.start <= hover && hover <= h.end);
  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover) - 90, 0), width - 190);

  return (
    <section className="timeline" aria-label={t.label}>
      <div className="timeline-head">
        <h2>{t.title}</h2>
        <span className="hint">{t.hint}</span>
        <span className="keys">
          {outlookPeriod && <span className="key"><i className="key-band outlook-key" />{t.outlookWindow}</span>}
          <span className="key"><i className="key-line load" />{published ? t.withChanges : t.points}</span>
          {published && <span className="key"><i className="key-line published" />{t.published}</span>}
          <span className="key"><i className="key-band" />{t.holidays}</span>
        </span>
      </div>
      <div className="timeline-plot" ref={wrap}>
        <svg
          ref={svg}
          width={width}
          height={H}
          role="slider"
          tabIndex={0}
          aria-label={t.slider}
          aria-valuemin={from}
          aria-valuemax={to}
          aria-valuenow={date}
          aria-valuetext={t.valueText(formatDay(date), one(at(date).total))}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {outlookPeriod && <rect className="outlook-window" x={x(Math.max(from, outlookPeriod.from))} y={PAD.top}
            width={Math.max(1, x(Math.min(to, outlookPeriod.to + 1)) - x(Math.max(from, outlookPeriod.from)))} height={plotH} />}
          {holidays.filter((h) => h.end >= from && h.start <= to).map((h) => {
            const x0 = x(Math.max(h.start, from));
            const x1 = x(Math.min(h.end + 1, to));
            return (
              <g key={h.start}>
                <rect className="holiday" x={x0} y={PAD.top} width={Math.max(1, x1 - x0)} height={plotH} />
                {x1 - x0 > 64 && <text className="holiday-label" x={x0 + 4} y={PAD.top + 11}>{h.name}</text>}
              </g>
            );
          })}
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line className="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(max * f)} y2={y(max * f)} />
              <text className="tick" x={PAD.left - 6} y={y(max * f) + 3} textAnchor="end">{max * f}</text>
            </g>
          ))}
          <line className="axis" x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} />
          <text className="tick" x={PAD.left - 6} y={y(0) + 3} textAnchor="end">0</text>
          {months.map((m) => (
            <g key={m}>
              <line className="axis" x1={x(m)} x2={x(m)} y1={y(0)} y2={y(0) + 4} />
              <text className="tick" x={x(m) + 3} y={H - 6}>{formatMonth(m)}{new Date(m * 86_400_000).getUTCMonth() === 0 ? ` ${new Date(m * 86_400_000).getUTCFullYear()}` : ''}</text>
            </g>
          ))}
          {horizon !== null && horizon >= from && horizon <= to && (
            <g>
              <line className="horizon" x1={x(horizon)} x2={x(horizon)} y1={PAD.top - 4} y2={y(0)} />
              <text className="marker-label" x={x(horizon) + 4} y={PAD.top - 6}>{t.plansEnd(formatShort(horizon))}</text>
            </g>
          )}
          <path className="load-area" d={`${path(load)}L${x(to)},${y(0)}L${x(from)},${y(0)}Z`} />
          {published && <path className="published-line" pathLength={1} d={path(published)} />}
          <path className="load-line" pathLength={1} d={path(load)} />
          <line className="today" x1={x(today)} x2={x(today)} y1={y(0)} y2={y(0) + 6} />
          <line className="selected" x1={x(date)} x2={x(date)} y1={PAD.top - 4} y2={y(0)} />
          <circle className="selected-dot" cx={x(date)} cy={y(at(date).total)} r={4.5} />
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} />}
        </svg>
        {hovered && (
          <div className="tooltip" style={{ left: tipLeft }} role="presentation">
            <div className="tooltip-title">{formatDay(hovered.day)}{hovered.day === today ? words.app.todaySuffix : ''}</div>
            <div className="tooltip-row"><i className="key-line load" />{t.pointsLine(<strong>{one(hovered.total)}</strong>, !!published)}</div>
            {hoveredPublished && <div className="tooltip-row"><i className="key-line published" />{t.publishedLine(<strong>{one(hoveredPublished.total)}</strong>)}</div>}
            <div className="tooltip-sub">{t.bands(one(hovered.high), one(hovered.medium), one(hovered.low))}</div>
            {hoveredHoliday && <div className="tooltip-sub">{hoveredHoliday.name}</div>}
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>{t.table}</summary>
        <table>
          <thead><tr><th>{t.month}</th><th>{t.average}</th><th>{t.busiest}</th></tr></thead>
          <tbody>
            {monthly.map((r) => (
              <tr key={r.m}><td>{formatMonth(r.m)} {new Date(r.m * 86_400_000).getUTCFullYear()}</td><td>{one(r.average)}</td><td>{t.peak(one(r.peak.total), formatShort(r.peak.day))}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
