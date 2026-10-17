import { PER_DAYS } from '../model/analysis';
import type { Priority } from '../model/analysis';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { metres, num, plural } from './format';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { freedWorking, priorityWorking } from './working';

type Props = { priorities: Priority[]; date: number; onSelectSite: (id: string) => void };

export function PrioritiesTab({ priorities, date, onSelectSite }: Props) {
  const cfg = useSettings();
  return (
    <div className="tab-body">
      <section className="block">
        <h3>Finish these first <span className="count">{priorities.length} running</span></h3>
        <Info>
          Running works ranked by how much finishing them sooner would help on {formatDay(date)}: how disruptive they are, how
          long they still run, what else overlaps, and whether people have another way to go. The top ten are numbered on the map; hover a rank for its score.
          Score = severity × remaining days ÷ {PER_DAYS} (at most {cfg['priority.horizon']} days) × (1 + {num(cfg['priority.perOverlap'])} for each
          overlapping site within {metres(cfg['clash.radius'])}, at most {cfg['priority.maxOverlaps']}) × {num(cfg['priority.emergency'])} within
          {' '}{metres(cfg['reach.fire'])} of a fire and rescue station or {metres(cfg['reach.hospital'])} of a hospital × {num(cfg['priority.noRail'])} with
          no Stadtbahn stop within {metres(cfg['reach.rail'])}. Severity = restriction weight × road weight, so a full closure on a main road is 1.
          All of these are in Settings.
        </Info>
        <ol className="ranked">
          {priorities.map((p, i) => (
            <li key={p.site.id}>
              <Derived className="rank" how={priorityWorking(p, i + 1, priorities.length, cfg)}>{i + 1}</Derived>
              <div>
                <button className="link-button" onClick={() => onSelectSite(p.site.id)}>{p.site.title}</button>
                <div className="muted">
                  {p.site.district} · {p.site.openEnded ? 'no end date' : `until ${formatDay(p.site.end)}`}{p.site.owner ? ` · ${p.site.owner}` : ''}
                </div>
                <div className="chips">{p.reasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div>
                {p.freedOverlapDays > 0 && <div className="muted small">{cfg['priority.sooner']} days sooner: <Derived how={freedWorking(p, cfg)}>{plural(p.freedOverlapDays, 'day')}</Derived> less overlap with works nearby</div>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
