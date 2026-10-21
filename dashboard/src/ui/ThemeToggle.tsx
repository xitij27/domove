import { useId } from 'react';
import { useStrings } from '../i18n';
import { setThemePreference, useTheme } from './theme';

/** One button for light and dark: the sun draws in its rays and a shadow slides over it to make the moon, and back. */
export function ThemeToggle() {
  const theme = useTheme();
  const t = useStrings().app;
  const mask = useId();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button" className="tool-button theme-toggle" data-theme-shown={theme}
      aria-label={t.dark} aria-pressed={theme === 'dark'} title={next === 'dark' ? t.dark : t.light}
      onClick={() => setThemePreference(next)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <mask id={mask}>
          <rect width="24" height="24" fill="#fff" />
          <circle className="theme-shadow" cx="17" cy="7" r="6.5" fill="#000" />
        </mask>
        <circle className="theme-body" cx="12" cy="12" r="5" fill="currentColor" mask={`url(#${mask})`} />
        <g className="theme-rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </g>
      </svg>
    </button>
  );
}
