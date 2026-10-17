import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, resolveTheme, setThemePreference } from './theme';

afterEach(() => vi.unstubAllGlobals());

describe('dashboard theme', () => {
  it('uses the system setting until a valid preference is saved', () => {
    expect(readThemePreference('light')).toBe('light');
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('unknown')).toBeNull();
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('unknown', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('saves a choice and reapplies it independently of the system setting', () => {
    const saved = new Map<string, string>();
    const root = { dataset: { theme: '' } };
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
      matchMedia: () => ({ matches: true }),
      dispatchEvent: vi.fn(),
    });

    setThemePreference('light');
    expect(saved.get('domove-dashboard-theme')).toBe('light');
    expect(root.dataset.theme).toBe('light');

    root.dataset.theme = '';
    applyTheme();
    expect(root.dataset.theme).toBe('light');
  });
});
