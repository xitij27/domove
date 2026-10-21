// Settings that are counts, such as lanes or sites: a − and a + around the number, one row each.
import { useStrings } from '../i18n';
import { DEFAULT_SETTINGS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import { nudge } from './rulerScale';
import { settingText } from './settingText';

type Props = { keys: SettingKey[]; settings: Settings; onChange: (key: SettingKey, value: number) => void };

export function Steppers({ keys, settings, onChange }: Props) {
  const st = useStrings().settings;
  return (
    <ul className="steppers">
      {keys.map((k) => {
        const s = SETTINGS[k];
        const v = settings[k];
        const label = st.labels[k];
        const changed = v !== DEFAULT_SETTINGS[k];
        return (
          <li key={k} className={changed ? 'changed' : undefined}>
            <span className="stepper-label">
              {label}
              {changed && <>{st.default(settingText(st, k, s.value))}<button className="link-button" onClick={() => onChange(k, s.value)}>{st.reset}</button></>}
            </span>
            <span className="stepper" role="group" aria-label={label}>
              <button type="button" aria-label={st.controls.less(label)} disabled={v <= s.min} onClick={() => onChange(k, nudge(k, v, -1, false))}>−</button>
              <output aria-live="polite">{settingText(st, k, v)}</output>
              <button type="button" aria-label={st.controls.more(label)} disabled={v >= s.max} onClick={() => onChange(k, nudge(k, v, 1, false))}>+</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
