import { describe, expect, it } from 'vitest';
import en from '../i18n/en';
import { GROUPS } from '../routing/valhalla';
import { MODES } from './modes';

describe('roles', () => {
  it('keeps every view and every travelling group reachable from some role', () => {
    expect(new Set(Object.values(MODES).flatMap((m) => m.tabs))).toEqual(new Set(Object.keys(en.app.tabs)));
    expect(new Set(Object.values(MODES).flatMap((m) => m.groups))).toEqual(new Set(Object.keys(GROUPS)));
  });

  it('names who a role plans routes for exactly when it has the Routes view', () => {
    for (const m of Object.values(MODES)) expect(m.groups.length > 0).toBe(m.tabs.includes('routes'));
  });
});
