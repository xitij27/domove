// Every weight and threshold behind the figures, each held between limits that keep its formula meaningful.
// One fold per group, so the panel opens on Severity's table rather than on sixty sliders.
import { useStrings } from '../i18n';
import { DEFAULT_SETTINGS, SETTING_KEYS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import type { Site } from '../model/sites';
import { Ruler } from './Ruler';
import { SeverityGrid } from './SeverityGrid';
import { LAYOUT } from './settingsLayout';
import { ShareBar } from './ShareBar';
import { Steppers } from './Steppers';

type Props = {
  settings: Settings;
  /** the chosen day's sites, counted in Severity's table */
  sites: Site[];
  day: string;
  changed: number;
  onChange: (key: SettingKey, value: number) => void;
  onChangeMany: (changes: Partial<Settings>) => void;
  onReset: () => void;
  onBack: () => void;
};

const GROUPS = [...new Set(SETTING_KEYS.map((k) => SETTINGS[k].group))];

export function SettingsPanel({ settings, sites, day, changed, onChange, onChangeMany, onReset, onBack }: Props) {
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
        <details className="setting-group" data-group={group} key={group} open={group === 'severity'}>
          <summary>
            <span className="setting-group-title">
              <i className="group-swatch" aria-hidden="true" />
              <h3>{t.groups[group].title}</h3>
              {changedHere > 0 && <span className="setting-group-changed">{t.groupChanged(changedHere)}</span>}
            </span>
            <span className="muted small">{t.groups[group].about}</span>
          </summary>
          {LAYOUT[group].map((c, i) =>
            c.type === 'table' ? <SeverityGrid key={i} settings={settings} sites={sites} day={day} onChange={onChange} />
              : c.type === 'ruler' ? <Ruler key={i} kind={c.kind} title={c.title} keys={c.keys} settings={settings} onChange={onChange} />
                : c.type === 'shares' ? <ShareBar key={i} keys={c.keys} settings={settings} onChangeMany={onChangeMany} />
                  : <Steppers key={i} keys={c.keys} settings={settings} onChange={onChange} />)}
        </details>
        );
      })}
    </div>
  );
}
