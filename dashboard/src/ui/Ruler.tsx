// Settings in one unit on one scale: a marker for each, and the picked one draggable within its own limits, which are
// shaded on the scale. The list under it names each marker with its value and a plain hint; picking a name picks its
// marker. Severity and review-priority rulers show their bands behind the scale.
import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useStrings } from '../i18n';
import { DEFAULT_SETTINGS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import { nudge, position, scaleFor, snap, ticks, valueAt } from './rulerScale';
import type { RulerKind } from './rulerScale';
import type { RulerTitle } from './settingsLayout';
import { hintFor, settingText, tickText } from './settingText';

type Props = { kind: RulerKind; title: RulerTitle; keys: SettingKey[]; settings: Settings; onChange: (key: SettingKey, value: number) => void };

/** Durations' track: blocks that alternate between two tints of the group's hue at each tick, like weeks on a calendar. */
function calendarBlocks(stops: number[]): string {
  const edges = [0, ...stops.filter((p) => p > 0 && p < 100), 100];
  const tint = (i: number) => `color-mix(in srgb, var(--g) ${i % 2 ? 30 : 12}%, var(--surface))`;
  return `linear-gradient(90deg, ${edges.slice(1).map((to, i) => `${tint(i)} ${edges[i]}% ${to}%`).join(', ')})`;
}

// half the thumb's width: the input reaches this far past its range so the thumb's centre sits on the value
const THUMB = 9;
const STEPS = 1000;

export function Ruler({ kind, title, keys, settings, onChange }: Props) {
  const t = useStrings();
  const st = t.settings;
  const c = st.controls;
  const [picked, setPicked] = useState<SettingKey>(keys[0]);
  const scale = scaleFor(kind, keys);
  const at = (v: number) => position(v, scale) * 100;
  const sel = SETTINGS[picked];
  const lo = at(sel.min) / 100;
  const span = at(sel.max) / 100 - lo;
  const toInput = (v: number) => (span ? Math.round(((position(v, scale) - lo) / span) * STEPS) : 0);
  const fromInput = (x: number) => snap(picked, valueAt(lo + (x / STEPS) * span, scale));
  const value = settings[picked];
  const changed = (k: SettingKey) => settings[k] !== DEFAULT_SETTINGS[k];
  const why = st.why[picked];

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key] as 1 | -1 | undefined;
    if (!dir) return;
    e.preventDefault();
    onChange(picked, nudge(picked, value, dir, e.shiftKey));
  };

  const zones = kind === 'severity'
    ? [['low', 0, settings['band.medium']], ['medium', settings['band.medium'], settings['band.high']], ['high', settings['band.high'], 1]] as const
    : kind === 'points'
      ? [['low', 0, settings['impact.band.medium']], ['medium', settings['impact.band.medium'], settings['impact.band.high']],
        ['high', settings['impact.band.high'], settings['impact.band.veryHigh']], ['veryHigh', settings['impact.band.veryHigh'], 100]] as const
      : [];

  return (
    <div className={`ruler kind-${kind}${zones.length ? ' zoned' : ''}`}>
      <div className="ruler-head">
        <h4>{c.titles[title]}</h4>
        {keys.length > 1 && <span className="muted small">{c.pick}</span>}
      </div>
      <div className="ruler-scale">
        <div className="ruler-track" style={kind === 'days' ? { background: calendarBlocks(ticks(kind, scale).map(at)) } : undefined}>
          {zones.map(([zone, from, to]) => (
            <span key={zone} className={`ruler-zone ${zone}`} style={{ left: `${at(from)}%`, width: `${at(to) - at(from)}%` }}>
              {kind === 'points' ? c.zones[zone] : t.bands[zone as 'low' | 'medium' | 'high']}
            </span>
          ))}
          <span className="ruler-allowed" style={{ left: `${lo * 100}%`, width: `${span * 100}%` }} />
          {keys.map((k) => (
            <span key={k} className={k === picked ? 'ruler-mark picked' : 'ruler-mark'} style={{ left: `${at(settings[k])}%` }} />
          ))}
        </div>
        <input
          type="range" className="ruler-input" min={0} max={STEPS} step={1} value={toInput(value)} disabled={!span}
          style={{ left: `calc(${lo * 100}% - ${THUMB}px)`, width: `calc(${span * 100}% + ${2 * THUMB}px)` } as CSSProperties}
          aria-label={st.labels[picked]} aria-valuetext={settingText(st, picked, value)}
          onChange={(e) => onChange(picked, fromInput(+e.target.value))} onKeyDown={onKey}
        />
        <div className="ruler-ticks" aria-hidden="true">
          {ticks(kind, scale).map((v) => <span key={v} style={{ left: `${at(v)}%` }}>{tickText(kind, v, t)}</span>)}
        </div>
      </div>
      <ul className="ruler-legend">
        {keys.map((k) => {
          const hint = hintFor(kind, settings[k], t, settings);
          return (
            <li key={k}>
              <button type="button" className={changed(k) ? 'changed' : undefined} aria-pressed={k === picked} onClick={() => setPicked(k)}>
                <span className="ruler-legend-label">{st.labels[k]}</span>
                <span className="ruler-legend-value">{settingText(st, k, settings[k])}{hint && <span className="muted"> {hint}</span>}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small ruler-why">
        {settingText(st, picked, sel.min)} – {settingText(st, picked, sel.max)}{why ? `: ${why}` : ''}
        {changed(picked) && <>{st.default(settingText(st, picked, sel.value))}<button className="link-button" onClick={() => onChange(picked, sel.value)}>{st.reset}</button></>}
      </p>
    </div>
  );
}
