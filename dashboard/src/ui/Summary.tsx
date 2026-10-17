export type Stat = { value: string; label: string; about: string; note?: { text: string; tone?: 'good' | 'bad' } };

/** The day's key figures as one line in the header; hover a figure for what it counts. */
export function Summary({ items }: { items: Stat[] }) {
  return (
    <ul className="summary" aria-label="Key figures for the chosen day">
      {items.map((s) => (
        <li key={s.label} title={s.about}>
          <strong>{s.value}</strong> {s.label}
          {s.note && <span className={`delta ${s.note.tone ?? ''}`}> · {s.note.text}</span>}
        </li>
      ))}
    </ul>
  );
}
