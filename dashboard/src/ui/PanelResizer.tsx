// The side panel's left edge: drag it, or focus it and use the arrow keys, to make the panel wider or narrower.
// A double-click puts it back. Hidden on phones, where the panel sits under the map.
import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStrings } from '../i18n';
import { clampWidth, DEFAULT_WIDTH, KEY_STEP, maxWidth, MIN_WIDTH, saveWidth } from './panelWidth';

type Props = { width: number; onWidth: (width: number) => void };

const workspaceOf = (el: Element) => el.closest('.workspace')?.getBoundingClientRect();

export function PanelResizer({ width, onWidth }: Props) {
  const t = useStrings().app;
  const dragging = useRef(false);
  const latest = useRef(width);

  const set = (next: number, el: Element, save: boolean) => {
    const box = workspaceOf(el);
    const w = box ? clampWidth(next, box.width) : next;
    latest.current = w;
    onWidth(w);
    if (save) saveWidth(w);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.classList.add('resizing-panel');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const box = workspaceOf(e.currentTarget);
    if (box) set(box.right - e.clientX, e.currentTarget, false);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove('resizing-panel');
    saveWidth(latest.current);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = workspaceOf(e.currentTarget);
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const next = { ArrowLeft: width + step, ArrowRight: width - step, Home: MIN_WIDTH, End: box ? maxWidth(box.width) : width }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    set(next, e.currentTarget, true);
  };

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizePanel}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      title={t.resizePanelHint}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => set(DEFAULT_WIDTH, e.currentTarget, true)}
      onKeyDown={onKeyDown}
    />
  );
}
