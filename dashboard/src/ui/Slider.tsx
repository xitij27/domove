/** A labelled range input showing its value; the range is the limit, so no value outside it can be set. */
export function Slider({ label, value, min, max, step, text, onChange }: {
  label: string; value: number; min: number; max: number; step: number; text: string; onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span>{label}: <strong>{text}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}
