import { Derived } from './Derived';
import type { Working } from './Derived';

export type Stat = { value: string; label: string; how: Working; note?: { text: string; tone?: 'good' | 'bad' } };

/** The day's key figures as one line in the header; hover a figure for how it's counted. */
export function Summary({ items }: { items: Stat[] }) {
  return (
    <ul className="summary" aria-label="Key figures for the chosen day">
      {items.map((s) => (
        <li key={s.label}>
          <Derived how={s.how}>
            <strong>{s.value}</strong> {s.label}
            {s.note && <span className={`delta ${s.note.tone ?? ''}`}> · {s.note.text}</span>}
          </Derived>
        </li>
      ))}
    </ul>
  );
}
