import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TransitFeature } from '../data/sources';
import { useStrings } from '../i18n';
import { TRANSIT_LAYERS, textOn } from './transitLayers';
import type { TransitLayer, TransitLayers } from './transitLayers';

type Props = {
  layers: TransitLayers;
  /** the Stadtbahn lines, for their chips; null until loaded */
  lines: TransitFeature[] | null;
  failed: boolean;
  focus: string | null;
  onToggle: (layer: TransitLayer) => void;
  onFocus: (ref: string | null) => void;
};

/** The Transit role's map control: a switch per kind of line or stop, and a chip per Stadtbahn line that picks out its route. */
export function TransitLayersCard({ layers, lines, failed, focus, onToggle, onFocus }: Props) {
  const t = useStrings().legend;
  // folded on phones, where it would cover the map
  const [open] = useState(() => !window.matchMedia('(max-width: 960px)').matches);
  const labels: Record<TransitLayer, string> = {
    stadtbahn: t.stadtbahnLines, train: t.trains, bus: t.buses, stop: t.stops, bike: t.bikeShare, pr: t.parkRide,
  };
  const keys: Record<TransitLayer, ReactNode> = {
    stadtbahn: <i className="net-key stadtbahn" />, train: <i className="net-key train" />, bus: <i className="net-key bus" />,
    stop: <span className="glyph">U</span>, bike: <span className="glyph">B</span>, pr: <span className="glyph">P</span>,
  };
  return (
    <details className="map-card network" open={open}>
      <summary className="legend-title">{t.network}</summary>
      <div role="group" aria-label={t.layers}>
        {TRANSIT_LAYERS.map((layer) => (
          <div key={layer}>
            <label className="layer">
              <input type="checkbox" checked={layers[layer]} onChange={() => onToggle(layer)} />
              {keys[layer]}
              <span>{labels[layer]}</span>
            </label>
            {layer === 'stadtbahn' && layers.stadtbahn && lines && (
              <div className={focus ? 'line-chips focused' : 'line-chips'}>
                {lines.map((l) => {
                  const ref = l.properties.ref ?? '';
                  const colour = l.properties.colour || '#2a78d6';
                  return (
                    <button key={ref} type="button" className="line-chip" aria-pressed={focus === ref} title={t.highlight(ref)}
                      style={{ background: colour, color: textOn(colour) }} onClick={() => onFocus(focus === ref ? null : ref)}>{ref}</button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {!lines && <p className={failed ? 'note' : 'muted small'} role={failed ? 'alert' : undefined}>{failed ? t.linesFailed : t.linesLoading}</p>}
      </div>
    </details>
  );
}
