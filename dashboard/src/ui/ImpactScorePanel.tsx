import type { Poi } from '../data/sources';
import { locale, useStrings } from '../i18n';
import type { ImpactAssessment, ImpactTarget } from '../model/impact';
import { Derived } from './Derived';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { impactWorking } from './working';

const number = (value: number) => value.toLocaleString(locale(), { maximumFractionDigits: 2 });

export function ImpactScorePanel({ assessment, target, locations, scenario, locationError, onTarget, onAdd, onRename, onRemove }: {
  assessment: ImpactAssessment | null; target: ImpactTarget; locations: Poi[]; scenario: boolean;
  locationError: string | null; onTarget: (target: ImpactTarget) => void; onAdd: () => void;
  onRename: (index: number, name: string) => void; onRemove: (index: number) => void;
}) {
  const cfg = useSettings();
  const t = useStrings().impact;
  return (
    <section className="block project-analytics" aria-labelledby="impact-title">
      <h3 id="impact-title">{t.title}</h3>
      <Info>
        <p>{t.about}</p>
        <p>{t.formula(cfg['impact.S'], cfg['impact.E'], cfg['impact.C'], cfg['impact.D'])}</p>
        <p>{t.exposureInfo}</p>
        <p>{t.caveat}</p>
      </Info>
      {scenario && <p className="note">{t.scenario}</p>}
      <label className="assessment-target">{t.context}
        <select value={target} onChange={(e) => onTarget(e.target.value as ImpactTarget)}>
          <option value="public">{t.public}</option>
          <option value="business">{t.business}</option>
        </select>
      </label>
      {target === 'business' && (
        <div className="block">
          <p className="muted small">{t.businessHint}</p>
          <ul className="plain">{locations.map((p, index) => (
            <li className="business-location" key={index}>
              <label>{t.location(index + 1)}<input value={p.name} maxLength={100} placeholder={t.placeholder} onChange={(e) => onRename(index, e.target.value)} />
                <span className="muted small">{p.at[1].toFixed(5)}° N, {p.at[0].toFixed(5)}° E</span>
              </label>
              <button type="button" className="button" aria-label={t.removeLocation(index + 1)} onClick={() => onRemove(index)}>{t.remove}</button>
            </li>
          ))}</ul>
          <button type="button" className="button" onClick={onAdd}>{t.addLocation}</button>
          {locationError && <p className="error" role="alert">{locationError}</p>}
        </div>
      )}
      <div aria-live="polite">
        {assessment?.total !== null && assessment?.total !== undefined ? (
          <p><Derived how={impactWorking(assessment, cfg)}><strong>{number(assessment.total)} / 100</strong></Derived> · {assessment.priority}</p>
        ) : (
          <>
            <p><strong>{t.insufficient}</strong></p>
            <p className="muted small">{assessment ? t.missing(assessment.missing.join(', ')) : t.noEvidence}</p>
          </>
        )}
      </div>
      {assessment && <ul className="plain impact-factors">{assessment.factors.map((f) => (
        <li key={f.key}>
          <details>
            <summary>{f.key} · {f.label} <span className="muted">{f.value === null ? t.unknown(f.weight) : t.points(number(f.value), f.weight, number(f.contribution!))}</span></summary>
            <p className="small">{f.reason}</p><p className="muted small">{t.source(f.source)}</p>
          </details>
        </li>
      ))}</ul>}
    </section>
  );
}
