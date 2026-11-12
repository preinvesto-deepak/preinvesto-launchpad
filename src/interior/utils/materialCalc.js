// Material Summary rules that used to be typed in per room: the Fevicol Merino
// multiplier (× laminate sheets), the Masking Tape divisor (edge band metres ÷ it)
// and the GST % shown on the summary totals. Set in App Settings > Material
// Calculation as account values (companyProfile.fevicolMultiplier / tapeDivisor /
// gstPercent) with one switch: on = every room uses them (companyProfile
// .materialCalcUniversal), off = each room keeps its own (room.fevicolMultiplier
// / tapeDivisor / gstPercent). Pushed in by AppDataProvider on every render, like
// the kerf and services registries, so plain helpers can read them.
export const CALC_DEFAULTS = { fevicolMultiplier: 0.7, tapeDivisor: 10, gstPercent: 18 };

const num = (v, fallback) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

let globals = { ...CALC_DEFAULTS };
let universal = false; // off until switched on, so rooms keep their own values until then

export const setMaterialCalcSettings = (profile) => {
  globals = {
    fevicolMultiplier: num(profile?.fevicolMultiplier, CALC_DEFAULTS.fevicolMultiplier),
    tapeDivisor: num(profile?.tapeDivisor, CALC_DEFAULTS.tapeDivisor),
    gstPercent: num(profile?.gstPercent, CALC_DEFAULTS.gstPercent),
  };
  universal = profile?.materialCalcUniversal === true;
};

export const materialCalcGlobals = () => globals;
export const isMaterialCalcUniversal = () => universal;

// The three values in force for a room.
export const calcFor = (room) => (universal ? globals : {
  fevicolMultiplier: num(room?.fevicolMultiplier, globals.fevicolMultiplier),
  tapeDivisor: num(room?.tapeDivisor, globals.tapeDivisor),
  gstPercent: num(room?.gstPercent, globals.gstPercent),
});
