export type Kpi = { label: string; value: string; detail: string; delta?: { text: string; good: boolean } };

/** Stat tiles: label, value, and what it's compared with. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <section className="kpis" aria-label="Key figures for the chosen day">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value">{k.value}</div>
          <div className="kpi-detail">
            {k.delta && (
              <span className={k.delta.good ? 'delta good' : 'delta bad'}>
                <span aria-hidden="true">{k.delta.good ? '▼' : '▲'}</span> {k.delta.text}
              </span>
            )}
            {k.detail}
          </div>
        </div>
      ))}
    </section>
  );
}
