import { useStrings } from '../i18n';
import { Derived } from './Derived';
import type { Working } from './Derived';

export type Stat = { value: string; label: string; how: Working; note?: { text: string; tone?: 'good' | 'bad' } };

/** The role's key figures for the day, side by side; hover a figure for how it's counted. */
export function Summary({ items }: { items: Stat[] }) {
  const t = useStrings();
  return (
    <ul className="summary" aria-label={t.app.keyFigures}>
      {items.map((s) => (
        <li key={s.label}>
          <Derived how={s.how}>
            <strong>{s.value}</strong> <span className="stat-label">{s.label}</span>
            {s.note && <span className={`delta ${s.note.tone ?? ''}`}> {s.note.text}</span>}
          </Derived>
        </li>
      ))}
    </ul>
  );
}
