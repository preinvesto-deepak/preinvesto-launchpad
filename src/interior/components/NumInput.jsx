import { useEffect, useState } from "react";

// A number box you can empty and retype. It keeps what is typed as text and hands
// the parent a number (blank counts as 0), so a "0" can be backspaced away and
// typing "1" over it gives 1, not 01. Outside changes (a pasted sheet, an applied
// template) still show up unless the box is being typed in. Any type other than
// "number" is a plain text box that passes the string through.
export default function NumInput({ value, onChange, ...rest }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === null || value === undefined ? "" : String(value));
  }, [value, focused]);

  if (rest.type && rest.type !== "number") {
    return <input {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      {...rest}
      type="number"
      value={text}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value === "" ? 0 : Number(e.target.value)); }}
    />
  );
}
