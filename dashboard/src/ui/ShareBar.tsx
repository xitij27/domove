// The impact score's four shares as one bar of 100: each part as wide as its share, and a divider between two parts
// that moves points from one to the next when dragged or nudged with the arrow keys. The total stays 100.
import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStrings } from '../i18n';
import { DEFAULT_SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import { boundsOf, moveDivider, SHARE_STEP as STEP } from './shares';

type Props = { keys: SettingKey[]; settings: Settings; onChangeMany: (changes: Partial<Settings>) => void };
export function ShareBar({ keys, settings, onChangeMany }: Props) {
  const t = useStrings();
  const c = t.settings.controls;
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const values = keys.map((k) => settings[k]);
  const bounds = boundsOf(values);
  const name = (k: SettingKey) => c.shareShort[k] ?? t.settings.labels[k];

  const set = (divider: number, at: number) => {
    const next = moveDivider(values, divider, at);
    onChangeMany(Object.fromEntries(keys.map((k, i) => [k, next[i]])));
  };
  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (dragging.current === null || !bar.current) return;
    const box = bar.current.getBoundingClientRect();
    set(dragging.current, ((e.clientX - box.left) / box.width) * 100);
  };
  const onKey = (divider: number) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    set(divider, bounds[divider + 1] + dir * STEP);
  };
  const changed = keys.some((k) => settings[k] !== DEFAULT_SETTINGS[k]);

  return (
    <div className="share">
      <p className="muted small">{c.shares}</p>
      <div className="share-bar" ref={bar}>
        {keys.map((k, i) => {
          const width = bounds[i + 1] - bounds[i];
          return (
            <span key={k} className={`share-part p${i}`} style={{ width: `${width}%` }} title={`${t.settings.labels[k]}: ${Math.round(width)}`}>
              {width >= 12 && <><span className="share-name">{name(k)}</span><strong>{Math.round(width)}</strong></>}
            </span>
          );
        })}
        {keys.slice(0, -1).map((k, i) => (
          <span
            key={k} className="share-divider" style={{ left: `${bounds[i + 1]}%` }} role="slider" tabIndex={0}
            aria-label={c.divider(name(keys[i]), name(keys[i + 1]))} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bounds[i + 1])}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); dragging.current = i; }}
            onPointerMove={onMove}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}
            onKeyDown={onKey(i)}
          />
        ))}
      </div>
      <ul className="share-legend">
        {keys.map((k, i) => (
          <li key={k}><i className={`share-swatch p${i}`} />{t.settings.labels[k]} <strong>{Math.round(bounds[i + 1] - bounds[i])}</strong></li>
        ))}
      </ul>
      {changed && (
        <p className="muted small">
          {t.settings.default(keys.map((k) => DEFAULT_SETTINGS[k]).join(' / '))}
          <button className="link-button" onClick={() => onChangeMany(Object.fromEntries(keys.map((k) => [k, DEFAULT_SETTINGS[k]])))}>{t.settings.reset}</button>
        </p>
      )}
    </div>
  );
}
