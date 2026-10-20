import { useStrings } from '../i18n';
import { PER_DAYS } from '../model/analysis';
import type { Priority } from '../model/analysis';
import { formatDay } from '../model/days';
import { Derived } from './Derived';
import { metres, num } from './format';
import { Info } from './Info';
import { SiteLink } from './SiteName';
import { useSettings } from './useSettings';
import { freedWorking, priorityWorking } from './working';

type Props = { priorities: Priority[]; date: number; onSelectSite: (id: string) => void };

export function PrioritiesTab({ priorities, date, onSelectSite }: Props) {
  const cfg = useSettings();
  const words = useStrings();
  const t = words.priorities;
  return (
    <div className="tab-body">
      <section className="block">
        <h3>{t.title} <span className="count">{t.running(priorities.length)}</span></h3>
        <Info>
          {t.info(formatDay(date), num(cfg['priority.severityPower']), PER_DAYS, cfg['priority.horizon'], num(cfg['priority.perOverlap']), metres(cfg['clash.radius']),
            cfg['priority.maxOverlaps'], num(cfg['priority.emergency']), metres(cfg['reach.fire']), metres(cfg['reach.hospital']),
            num(cfg['priority.noStop']), metres(cfg['reach.stop']), metres(cfg['reach.station']))}
        </Info>
        <ol className="ranked">
          {priorities.map((p, i) => (
            <li key={p.site.id}>
              <Derived className="rank" how={priorityWorking(p, i + 1, priorities.length, cfg)}>{i + 1}</Derived>
              <div>
                <SiteLink site={p.site} onSelect={onSelectSite} />
                <div className="muted">
                  {p.site.district} · {p.site.openEnded ? t.noEndDate : t.until(formatDay(p.site.end))}{p.site.owner ? ` · ${p.site.owner}` : ''}
                </div>
                <div className="chips">{p.reasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div>
                {p.freedOverlapDays > 0 && (
                  <div className="muted small">{t.sooner(cfg['priority.sooner'], <Derived how={freedWorking(p, cfg)}>{words.n.day(p.freedOverlapDays)}</Derived>)}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
