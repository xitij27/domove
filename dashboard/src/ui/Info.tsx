import type { ReactNode } from 'react';
import { useStrings } from '../i18n';

/** A small (i) at the top right of a section that unfolds its explanation, so the section leads with what to do. */
export function Info({ children }: { children: ReactNode }) {
  const t = useStrings();
  return (
    <details className="info">
      <summary aria-label={t.app.howThisWorks} title={t.app.howThisWorks}>i</summary>
      <div className="info-body">{children}</div>
    </details>
  );
}
