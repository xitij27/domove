import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, resolveTheme, setThemePreference } from './theme';

afterEach(() => vi.unstubAllGlobals());

describe('dashboard theme', () => {
  it('starts light until a valid preference is saved', () => {
    expect(readThemePreference('light')).toBe('light');
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('unknown')).toBeNull();
    expect(resolveTheme(null)).toBe('light');
    expect(resolveTheme('unknown')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('starts light on a system set to dark, then saves and reapplies a choice', () => {
    const saved = new Map<string, string>();
    const root = { dataset: { theme: '' } };
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
      matchMedia: () => ({ matches: true }), // the system asks for dark
      dispatchEvent: vi.fn(),
    });

    applyTheme();
    expect(root.dataset.theme).toBe('light');

    setThemePreference('dark');
    expect(saved.get('domove-dashboard-theme')).toBe('dark');
    expect(root.dataset.theme).toBe('dark');

    setThemePreference('light');
    expect(saved.get('domove-dashboard-theme')).toBe('light');
    expect(root.dataset.theme).toBe('light');

    root.dataset.theme = '';
    applyTheme();
    expect(root.dataset.theme).toBe('light');
  });
});
