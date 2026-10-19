import type { ReactNode } from 'react';
import { useStrings } from '../i18n';
import { MODE_ORDER } from './modes';
import type { Mode } from './modes';

const ICONS: Record<Mode, ReactNode> = {
  // a calendar with one booked slot: works placed in time
  plan: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M7.5 13.5h4v3.5h-4z" /></>,
  traffic: <><rect x="8" y="2.5" width="8" height="19" rx="3" /><circle cx="12" cy="7" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="17" r="1.5" /></>,
  // a blue light on its base
  emergency: <><path d="M6.5 18v-4.5a5.5 5.5 0 0 1 11 0V18" /><path d="M4 18h16v3H4zM12 2.5v2M4.6 5.6 6 7M19.4 5.6 18 7" /></>,
  transit: <><rect x="5" y="4" width="14" height="14" rx="3" /><path d="M5 11h14M9 18l-2 3.5M15 18l2 3.5M9.5 1.5h5" /><circle cx="9" cy="14.5" r="0.9" /><circle cx="15" cy="14.5" r="0.9" /></>,
};

/** The roles across the header; the picked one wears the yellow of a temporary road marking. */
export function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const t = useStrings().modes;
  return (
    <nav className="modes" aria-label={t.label}>
      {MODE_ORDER.map((m) => (
        <button key={m} type="button" className="mode" aria-pressed={mode === m} title={t.role[m]} onClick={() => onMode(m)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[m]}
          </svg>
          <span className="mode-text">
            <span className="mode-name">{t.name[m]}</span>
            <span className="mode-role">{t.role[m]}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
