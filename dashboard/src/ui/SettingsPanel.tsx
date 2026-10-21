// Every weight and threshold behind the figures, each held between limits that keep its formula meaningful.
// One fold per group, so the panel opens on Severity's table rather than on sixty sliders.
import { useStrings } from '../i18n';
import type { Strings } from '../i18n';
import { DEFAULT_SETTINGS, SETTING_KEYS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import type { Site } from '../model/sites';
import { num } from './format';
import { SeverityGrid } from './SeverityGrid';
import { Slider } from './Slider';

type Props = {
  settings: Settings;
  /** the chosen day's sites, counted in Severity's table */
  sites: Site[];
  day: string;
  changed: number;
  onChange: (key: SettingKey, value: number) => void;
  onReset: () => void;
  onBack: () => void;
};

const GROUPS = [...new Set(SETTING_KEYS.map((k) => SETTINGS[k].group))];
const show = (t: Strings['settings'], key: SettingKey, v: number) => {
  const unit = SETTINGS[key].unit;
  return `${num(v)}${unit ? ` ${t.units[unit]}` : ''}`;
};

export function SettingsPanel({ settings, sites, day, changed, onChange, onReset, onBack }: Props) {
  const t = useStrings().settings;
  return (
    <div className="site-panel">
      <button className="back-button" onClick={onBack}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t.back}
      </button>
      <h2 className="site-title">{t.title}</h2>
      <p className="muted small">{t.intro}</p>
      {changed > 0 && (
        <p className="settings-changed">{t.changed(changed)} <button className="button" onClick={onReset}>{t.resetAll}</button></p>
      )}
      {GROUPS.map((group) => {
        const keys = SETTING_KEYS.filter((k) => SETTINGS[k].group === group);
        const changedHere = keys.filter((k) => settings[k] !== DEFAULT_SETTINGS[k]).length;
        return (
        <details className="setting-group" key={group} open={group === 'severity'}>
          <summary>
            <span className="setting-group-title">
              <h3>{t.groups[group].title}</h3>
              {changedHere > 0 && <span className="setting-group-changed">{t.groupChanged(changedHere)}</span>}
            </span>
            <span className="muted small">{t.groups[group].about}</span>
          </summary>
          {group === 'severity' ? <SeverityGrid settings={settings} sites={sites} day={day} onChange={onChange} /> : keys.map((k) => {
            const s = SETTINGS[k];
            const label = t.labels[k];
            const why = t.why[k];
            if (s.min === s.max) return <p className="setting-fixed" key={k}>{label}: <strong>{show(t, k, s.value)}</strong> <span className="muted small">({why})</span></p>;
            const isChanged = settings[k] !== DEFAULT_SETTINGS[k];
            return (
              <div className={isChanged ? 'setting changed' : 'setting'} key={k}>
                <Slider label={label} value={settings[k]} min={s.min} max={s.max} step={s.step} text={show(t, k, settings[k])} onChange={(v) => onChange(k, v)} />
                <p className="muted small">
                  {show(t, k, s.min)} – {show(t, k, s.max)}{why ? `: ${why}` : ''}
                  {isChanged && <>{t.default(show(t, k, s.value))}<button className="link-button" onClick={() => onChange(k, s.value)}>{t.reset}</button></>}
                </p>
              </div>
            );
          })}
        </details>
        );
      })}
    </div>
  );
}
