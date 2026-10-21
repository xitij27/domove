// Severity in Settings as a table: what a site closes down the side, the road across the top, and in each cell the
// severity that makes, coloured by its band, with how many of the chosen day's sites sit there. Picking a row, a road
// or the band scale opens one slider for it, and the table follows as it is dragged.
import { useState } from 'react';
import { useStrings } from '../i18n';
import type { ClosureKind } from '../model/closures';
import { bandCounts, GRID_ROADS, severityGrid } from '../model/severityGrid';
import { DEFAULT_SETTINGS, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import type { RoadClass, Site } from '../model/sites';
import { num } from './format';
import { Slider } from './Slider';

type Pick_ = { kind: ClosureKind } | { road: RoadClass } | 'bands' | null;
type Props = { settings: Settings; sites: Pick<Site, 'kinds' | 'road'>[]; day: string; onChange: (key: SettingKey, value: number) => void };

const BAND_KEYS: SettingKey[] = ['band.medium', 'band.high'];
const SEVERITY_KEYS = Object.keys(SETTINGS).filter((k) => SETTINGS[k as SettingKey].group === 'severity') as SettingKey[];

export function SeverityGrid({ settings, sites, day, onChange }: Props) {
  const t = useStrings();
  const g = t.settings.grid;
  const [picked, setPicked] = useState<Pick_>(null);
  const grid = severityGrid(settings, sites);
  const counts = bandCounts(settings, sites);
  const changed = SEVERITY_KEYS.some((k) => settings[k] !== DEFAULT_SETTINGS[k]);
  const base = changed ? bandCounts(DEFAULT_SETTINGS, sites) : null;

  const isKind = (kind: ClosureKind) => !!picked && typeof picked === 'object' && 'kind' in picked && picked.kind === kind;
  const isRoad = (road: RoadClass) => !!picked && typeof picked === 'object' && 'road' in picked && picked.road === road;
  const focused = picked && picked !== 'bands';
  const toggle = (next: Pick_) => setPicked(JSON.stringify(next) === JSON.stringify(picked) ? null : next);
  const isChanged = (key: SettingKey) => settings[key] !== DEFAULT_SETTINGS[key];

  const keys: SettingKey[] = !picked ? [] : picked === 'bands' ? BAND_KEYS : 'kind' in picked ? [`weight.${picked.kind}`] : [`road.${picked.road}`];
  const title = !picked ? '' : picked === 'bands' ? g.scaleTitle : 'kind' in picked ? t.kinds[picked.kind] : t.settings.labels[`road.${picked.road}`];
  const medium = settings['band.medium'];
  const high = settings['band.high'];

  return (
    <div className="severity">
      <p className="muted small">{g.intro}</p>
      <table className={focused ? 'severity-grid focused' : 'severity-grid'}>
        <thead>
          <tr>
            <th scope="col" className="sg-corner">{g.closes}</th>
            {GRID_ROADS.map((road) => (
              <th scope="col" key={road}>
                <button type="button" className={isChanged(`road.${road}`) ? 'sg-pick changed' : 'sg-pick'} aria-pressed={isRoad(road)} onClick={() => toggle({ road })}>
                  <span>{t.settings.labels[`road.${road}`]}</span>
                  <span className="sg-weight">{g.weight(num(settings[`road.${road}`]))}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => {
            const kind = row[0].kind;
            return (
              <tr key={kind}>
                <th scope="row">
                  <button type="button" className={isChanged(`weight.${kind}`) ? 'sg-pick changed' : 'sg-pick'} aria-pressed={isKind(kind)} onClick={() => toggle({ kind })}>
                    <span>{t.kinds[kind]}</span>
                    <span className="sg-weight">{num(settings[`weight.${kind}`])}</span>
                  </button>
                </th>
                {row.map((c) => (
                  <td key={c.road} className={`sg-cell ${c.band}${isKind(kind) || isRoad(c.road) ? ' lit' : ''}`}
                    title={g.cellTitle(t.kinds[kind], t.roads[c.road], num(c.severity), t.bands[c.band], c.sites)}>
                    <span className="sg-value">{num(c.severity)}</span>
                    {c.sites > 0 && <span className="sg-count">{c.sites}</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <button type="button" className={BAND_KEYS.some(isChanged) ? 'sg-scale changed' : 'sg-scale'} aria-pressed={picked === 'bands'}
        aria-label={g.scaleTitle} onClick={() => toggle('bands')}>
        <span className="sg-zones" aria-hidden="true">
          <span className="sg-zone low" style={{ width: `${medium * 100}%` }}>{t.bands.low}</span>
          <span className="sg-zone medium" style={{ width: `${(high - medium) * 100}%` }}>{t.bands.medium}</span>
          <span className="sg-zone high">{t.bands.high}</span>
        </span>
        <span className="sg-ticks" aria-hidden="true">
          <span style={{ left: 0 }}>0</span>
          <span style={{ left: `${medium * 100}%` }}>{num(medium)}</span>
          <span style={{ left: `${high * 100}%` }}>{num(high)}</span>
          <span style={{ left: '100%' }}>1</span>
        </span>
      </button>

      {picked && (
        <div className="sg-editor">
          <div className="sg-editor-head">
            <strong>{title}</strong>
            <button type="button" className="link-button" onClick={() => setPicked(null)}>{g.done}</button>
          </div>
          {keys.map((k) => {
            const s = SETTINGS[k];
            const why = t.settings.why[k];
            if (s.min === s.max) return <p className="muted small" key={k}>{num(s.value)}: {why}</p>;
            return (
              <div key={k}>
                <Slider label={t.settings.labels[k]} value={settings[k]} min={s.min} max={s.max} step={s.step} text={num(settings[k])} onChange={(v) => onChange(k, v)} />
                <p className="muted small">
                  {num(s.min)} – {num(s.max)}{why ? `: ${why}` : ''}
                  {isChanged(k) && <>{t.settings.default(num(s.value))}<button className="link-button" onClick={() => onChange(k, s.value)}>{t.settings.reset}</button></>}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {!picked && <p className="muted small">{g.hint}</p>}

      <p className="sg-counts">
        {g.counts(day, counts.high, counts.medium, counts.low)}
        {base && <span className="muted">{g.defaults(base.high, base.medium, base.low)}</span>}
      </p>
    </div>
  );
}
