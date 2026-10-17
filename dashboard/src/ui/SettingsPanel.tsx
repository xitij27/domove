// Every weight and threshold behind the figures, each held between limits that keep its formula meaningful.
import { DEFAULT_SETTINGS, SETTING_KEYS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import { num, plural } from './format';
import { Info } from './Info';
import { Slider } from './Slider';

type Props = {
  settings: Settings;
  changed: number;
  onChange: (key: SettingKey, value: number) => void;
  onReset: () => void;
  onBack: () => void;
};

const ABOUT: Record<string, string> = {
  'Severity': 'Every score starts from a site\'s severity: restriction weight × road weight. A full closure on a main road is 1 disruption point, so those two stay fixed and no other weight goes above 1.',
  'Clashes': 'Which works count as clashing, and which are on the same stretch and better done together. Drives the clash count, the To do moves and the Coordinate tab.',
  'Best dates': 'How a suggested start date is scored: the overlap with clashing works, less these credits, plus the cost of moving. The lowest cost wins.',
  'Access': 'Walking distance to the Stadtbahn and nearness to fire stations and hospitals, used by Priorities and Transit.',
  'Priorities': 'How running works are ranked for finishing sooner.',
  'Transit': 'Which districts need transit help, and which Stadtbahn stops should expect extra riders.',
  'Works programme': 'When a district\'s projects in construction in a period are marked ▲ overloaded.',
  'Road capacity': 'The Capacity tab\'s what-if model. Road use today, residents and car trips stay on that tab.',
};
const GROUPS = [...new Set(SETTING_KEYS.map((k) => SETTINGS[k].group))];
const show = (key: SettingKey, v: number) => `${num(v)}${SETTINGS[key].unit ? ` ${SETTINGS[key].unit}` : ''}`;

export function SettingsPanel({ settings, changed, onChange, onReset, onBack }: Props) {
  return (
    <div className="site-panel">
      <button className="back-button" onClick={onBack}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </button>
      <h2 className="site-title">Settings</h2>
      <p className="muted small">
        The weights and thresholds behind every figure. Each slider stops at limits that keep its formula meaningful. Changes apply
        everywhere at once and go into the scenario link, so whoever opens it sees the same numbers.
      </p>
      {changed > 0 && (
        <p className="settings-changed">{plural(changed, 'setting')} changed <button className="button" onClick={onReset}>Reset all to defaults</button></p>
      )}
      {GROUPS.map((group) => (
        <section className="block" key={group}>
          <h3>{group}</h3>
          <Info>{ABOUT[group]}</Info>
          {SETTING_KEYS.filter((k) => SETTINGS[k].group === group).map((k) => {
            const s = SETTINGS[k];
            if (s.min === s.max) return <p className="setting-fixed" key={k}>{s.label}: <strong>{show(k, s.value)}</strong> <span className="muted small">({s.why})</span></p>;
            const isChanged = settings[k] !== DEFAULT_SETTINGS[k];
            return (
              <div className={isChanged ? 'setting changed' : 'setting'} key={k}>
                <Slider label={s.label} value={settings[k]} min={s.min} max={s.max} step={s.step} text={show(k, settings[k])} onChange={(v) => onChange(k, v)} />
                <p className="muted small">
                  {show(k, s.min)} – {show(k, s.max)}{s.why ? `: ${s.why}` : ''}
                  {isChanged && <> · default {show(k, s.value)} <button className="link-button" onClick={() => onChange(k, s.value)}>Reset</button></>}
                </p>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
