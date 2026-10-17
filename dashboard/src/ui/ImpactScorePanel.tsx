import type { Poi } from '../data/sources';
import type { ImpactAssessment, ImpactTarget } from '../model/impact';
import { Derived } from './Derived';
import { Info } from './Info';
import { useSettings } from './useSettings';
import { impactWorking } from './working';

const number = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });

export function ImpactScorePanel({ assessment, target, locations, scenario, locationError, onTarget, onAdd, onRename, onRemove }: {
  assessment: ImpactAssessment | null; target: ImpactTarget; locations: Poi[]; scenario: boolean;
  locationError: string | null; onTarget: (target: ImpactTarget) => void; onAdd: () => void;
  onRename: (index: number, name: string) => void; onRemove: (index: number) => void;
}) {
  const cfg = useSettings();
  return (
    <section className="block project-analytics" aria-labelledby="impact-title">
      <h3 id="impact-title">Construction Impact Score</h3>
      <Info>
        <p>A prototype review-priority indicator for one project. Disruption Points remain the separate, citywide daily sum of restriction × road weights.</p>
        <p>{cfg['impact.S']} × S + {cfg['impact.E']} × E + {cfg['impact.C']} × C + {cfg['impact.D']} × D, scaled to 100 (change the shares in Settings). All factors are between 0 and 1. No total is calculated if a required factor is unknown; weights are not redistributed.</p>
        <p>Exposure uses the maximum factor from the nearest relevant location to the actual footprint. Public locations are schools, kindergartens and available rail stops. Conflict evidence is shared with Construction Outlook across full reported project periods.</p>
        <p>Provisional weights and priority bands are unvalidated planning assumptions, not measured traffic impact, delays, economic losses or an official Dortmund metric. Proximity does not prove disruption. Traffic Context remains separate and adds no fifth factor.</p>
      </Info>
      {scenario && <p className="note">Scenario assessment: includes proposed dates or footprints, not only published plans.</p>}
      <label className="assessment-target">Assessment context
        <select value={target} onChange={(e) => onTarget(e.target.value as ImpactTarget)}>
          <option value="public">Public Services / City Administration</option>
          <option value="business">Business / Logistics</option>
        </select>
      </label>
      {target === 'business' && (
        <div className="block">
          <p className="muted small">Choose relevant premises, warehouses or delivery destinations on the map. Locations stay in memory in this browser tab and are excluded from shared scenario links and exports.</p>
          <ul className="plain">{locations.map((p, index) => (
            <li className="business-location" key={index}>
              <label>Location {index + 1}<input value={p.name} maxLength={100} placeholder="Warehouse / delivery destination" onChange={(e) => onRename(index, e.target.value)} />
                <span className="muted small">{p.at[1].toFixed(5)}° N, {p.at[0].toFixed(5)}° E</span>
              </label>
              <button type="button" className="button" aria-label={`Remove location ${index + 1}`} onClick={() => onRemove(index)}>Remove</button>
            </li>
          ))}</ul>
          <button type="button" className="button" onClick={onAdd}>Add location on map</button>
          {locationError && <p className="error" role="alert">{locationError}</p>}
        </div>
      )}
      <div aria-live="polite">
        {assessment?.total !== null && assessment?.total !== undefined ? (
          <p><Derived how={impactWorking(assessment, cfg)}><strong>{number(assessment.total)} / 100</strong></Derived> · {assessment.priority}</p>
        ) : (
          <>
            <p><strong>Insufficient data to calculate Impact Score</strong></p>
            <p className="muted small">{assessment ? `Missing: ${assessment.missing.join(', ')}.` : 'No separate source evidence is available for this project representation.'}</p>
          </>
        )}
      </div>
      {assessment && <ul className="plain impact-factors">{assessment.factors.map((f) => (
        <li key={f.key}>
          <details>
            <summary>{f.key} · {f.label} <span className="muted">{f.value === null ? `Unknown (${f.weight}% weight)` : `${number(f.value)} × ${f.weight} = ${number(f.contribution!)} points`}</span></summary>
            <p className="small">{f.reason}</p><p className="muted small">Source: {f.source}.</p>
          </details>
        </li>
      ))}</ul>}
    </section>
  );
}
