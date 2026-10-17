import type { LonLat } from '../model/geo';

/** Decodes an encoded polyline into [lon, lat] pairs; Valhalla encodes with 6 decimals. */
export function decodePolyline(text: string, precision = 6): LonLat[] {
  const factor = 10 ** precision;
  const out: LonLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    // arithmetic instead of bit shifts, which overflow 32 bits for long first values
    let result = 0;
    let scale = 1;
    let byte: number;
    do {
      byte = text.charCodeAt(index++) - 63;
      result += (byte & 0x1f) * scale;
      scale *= 32;
    } while (byte >= 0x20);
    return result % 2 ? -(result + 1) / 2 : result / 2;
  };
  while (index < text.length) {
    lat += next();
    lon += next();
    out.push([lon / factor, lat / factor]);
  }
  return out;
}
