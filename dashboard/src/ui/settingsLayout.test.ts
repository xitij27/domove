import { expect, it } from 'vitest';
import { SETTING_KEYS, SETTINGS } from '../model/settings';
import { keysOf, LAYOUT } from './settingsLayout';

it('shows every setting once, in its own group', () => {
  const shown = Object.entries(LAYOUT).flatMap(([group, controls]) =>
    controls.flatMap((c) => (c.type === 'table' ? SETTING_KEYS.filter((k) => SETTINGS[k].group === group) : keysOf(c))));
  expect([...shown].sort()).toEqual([...SETTING_KEYS].sort());
  for (const [group, controls] of Object.entries(LAYOUT)) {
    for (const k of controls.flatMap(keysOf)) expect(SETTINGS[k].group).toBe(group);
  }
});
