import NumInput from "./NumInput";

// A count box with "−" on the left and "+" on the right. Typing still works; the
// buttons add or take away `step` (default 1), never going below `min` (default 0).
// `width` sets the whole control's width (the box stretches between the buttons).
export default function StepInput({ value, onChange, min = 0, step = 1, width, style, ...rest }) {
  const n = Number(value) || 0;
  const set = (v) => onChange(Math.max(min, Math.round(v * 100) / 100));
  const btn = {
    width: 22, flex: "0 0 22px", padding: 0, fontSize: 15, lineHeight: 1, fontWeight: 700,
    background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", cursor: "pointer",
  };
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: width ?? style?.width ?? "100%", margin: "0 auto" }}>
      <button type="button" title="Decrease" disabled={n <= min} onClick={() => set(n - step)}
        style={{ ...btn, borderRadius: "6px 0 0 6px", opacity: n <= min ? 0.45 : 1 }}>−</button>
      <NumInput
        {...rest}
        min={min}
        step={step}
        value={value}
        onChange={onChange}
        style={{ ...style, width: "auto", flex: 1, minWidth: 0, textAlign: "center", borderRadius: 0 }}
      />
      <button type="button" title="Increase" onClick={() => set(n + step)}
        style={{ ...btn, borderRadius: "0 6px 6px 0" }}>+</button>
    </div>
  );
}
