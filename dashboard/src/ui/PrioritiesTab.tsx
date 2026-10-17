import type { Priority } from '../model/analysis';
import { formatDay } from '../model/days';
import { plural } from './format';

type Props = { priorities: Priority[]; date: number; onSelectSite: (id: string) => void };

export function PrioritiesTab({ priorities, date, onSelectSite }: Props) {
  return (
    <div className="tab-body">
      <section className="block">
        <h3>Finish these first <span className="count">{priorities.length} running</span></h3>
        <p className="muted">
          Running works ranked by how much finishing them sooner would help on {formatDay(date)}: how disruptive they are,
          how long they still run, what else overlaps, and whether people have another way to go. The top ten are numbered on the map.
        </p>
        <ol className="ranked">
          {priorities.slice(0, 15).map((p, i) => (
            <li key={p.site.id}>
              <span className="rank" aria-hidden="true">{i + 1}</span>
              <div>
                <button className="link-button" onClick={() => onSelectSite(p.site.id)}>{p.site.title}</button>
                <div className="muted">
                  {p.site.district} · {p.site.openEnded ? 'no end date' : `until ${formatDay(p.site.end)}`}{p.site.owner ? ` · ${p.site.owner}` : ''}
                </div>
                <div className="chips">{p.reasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div>
                {p.freedOverlapDays > 0 && <div className="muted small">Two weeks sooner: {plural(p.freedOverlapDays, 'day')} less overlap with works nearby</div>}
              </div>
            </li>
          ))}
        </ol>
        <details className="explain">
          <summary>How the ranking works</summary>
          <p>
            Score = severity × remaining days ÷ 30 (at most 180 days) × (1 + ½ for each overlapping site within 1 km, at most 6)
            × 1.5 within 500 m of a fire and rescue station or 300 m of a hospital × 1.5 with no Stadtbahn stop within 600 m.
            Severity = restriction weight × road weight, so a full closure on a main road is 1 and on a residential street 0.3.
          </p>
        </details>
      </section>
    </div>
  );
}
