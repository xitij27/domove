import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTING_KEYS, SETTINGS } from '../model/settings';
import en from '../i18n/en';
import { SettingsPanel } from './SettingsPanel';

const render = (settings = DEFAULT_SETTINGS) => renderToStaticMarkup(
  <SettingsPanel settings={settings} sites={[]} day="21 Oct 2026" changed={0}
    onChange={() => {}} onChangeMany={() => {}} onReset={() => {}} onBack={() => {}} />);

it('names every setting outside Severity once, on a ruler, a stepper or the shares bar', () => {
  const html = render();
  for (const k of SETTING_KEYS.filter((k) => SETTINGS[k].group !== 'severity')) {
    expect(html, k).toContain(en.settings.labels[k].replaceAll("'", '&#x27;').replaceAll('"', '&quot;'));
  }
  expect(html).not.toContain('type="range" min="500"');
  expect(html).toContain('≈ 5 min on foot');
  expect(html).toContain('≈ 6 months');
});

it('says how many settings a fold has changed', () => {
  const html = render({ ...DEFAULT_SETTINGS, 'reach.stop': 600, 'reach.fire': 800 });
  expect(html).toContain('2 changed');
});
