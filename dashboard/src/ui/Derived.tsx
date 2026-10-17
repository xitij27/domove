import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** The inputs and arithmetic behind one figure, with that figure's own numbers: [what, how much] per row. */
export type Working = [string, string][];

/** A figure the dashboard worked out, underlined dotted. Hover, focus or tap it for its working; Escape closes it. */
export function Derived({ how, className, children }: { how: Working; className?: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  // fixed, so the panel's scrolling can't clip it; below the figure unless that runs off the screen
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchor.current!.getBoundingClientRect();
    const t = tip.current!;
    const below = a.bottom + 6 + t.offsetHeight <= window.innerHeight;
    t.style.left = `${Math.max(8, Math.min(a.left, window.innerWidth - t.offsetWidth - 8))}px`;
    t.style.top = `${below ? a.bottom + 6 : Math.max(8, a.top - 6 - t.offsetHeight)}px`;
  }, [open]);

  return (
    <span
      ref={anchor} className={className ? `derived ${className}` : 'derived'} tabIndex={0} aria-describedby={id}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children}
      <span ref={tip} id={id} role="tooltip" className="derived-tip" hidden={!open}>
        {how.map(([what, value]) => <Fragment key={what}><span>{what}</span><span>{value}</span></Fragment>)}
      </span>
    </span>
  );
}
