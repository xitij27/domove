import type { ReactNode } from 'react';

/** A small (i) at the top right of a section that unfolds its explanation, so the section leads with what to do. */
export function Info({ children }: { children: ReactNode }) {
  return (
    <details className="info">
      <summary aria-label="How this works" title="How this works">i</summary>
      <div className="info-body">{children}</div>
    </details>
  );
}
