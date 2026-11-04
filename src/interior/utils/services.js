import { mmToFeet } from "./unitConversions";
import { GROUP_OPTIONS } from "../data/priceData";

// Non-wardrobe work a room can carry alongside its boxes. Nothing is built in:
// every service is defined by the account (False Ceiling, Tiles, Electrical,
// ...) with a name, how it is measured and the Items Pricing group its items
// live in. A box with no serviceType is ordinary wardrobe/modular work (cut
// list + sheet nesting); a box with a service is priced directly as quantity ×
// the rate of the Items Pricing item picked for it.
//   measure "area"   → H × W in sq ft
//   measure "length" → W in running feet
//   measure "points" → a typed count (serviceQty)
export const MEASURE_UNITS = { area: "sqft", length: "rft", points: "pt" };
export const MEASURE_LABELS = {
  area: "Area — H × W in sq ft",
  length: "Length — W in running ft",
  points: "Count — number of points",
};

// SERVICES / SERVICE_NAMES / ALL_SERVICES are shared live objects: the
// services the account added (stored in
// companyProfile.customServices and pushed in by syncCustomServices below),
// mutated in place so every importer sees additions without re-importing.
export const SERVICES = {};
export const SERVICE_NAMES = [];

// What a record with no service tag is — the original wardrobe/modular work.
// A live binding: syncCustomServices reassigns it when the account renames it.
export const DEFAULT_WARDROBE_SERVICE = "Wardrobe / Modular";
export let WARDROBE_SERVICE = DEFAULT_WARDROBE_SERVICE;
// True once the account deleted wardrobe from the service list (companyProfile.wardrobeHidden).
export let WARDROBE_HIDDEN = false;
export const ALL_SERVICES = [WARDROBE_SERVICE];

// Items Pricing groups the services added to GROUP_OPTIONS, so a resync can
// take them back out again.
let addedGroups = [];

// Replace the services with `list` ([{ name, group, measure }]).
// Idempotent — safe to call on every render of the data provider.
export function syncCustomServices(list, wardrobeName, wardrobeHidden) {
  WARDROBE_HIDDEN = !!wardrobeHidden;
  WARDROBE_SERVICE = (wardrobeName || "").trim() || DEFAULT_WARDROBE_SERVICE;
  Object.keys(SERVICES).forEach((k) => delete SERVICES[k]);
  (Array.isArray(list) ? list : []).forEach((s) => {
    const name = (s?.name || "").trim();
    if (!name || SERVICES[name] || WARDROBE_SERVICE === name) return;
    const measure = MEASURE_UNITS[s.measure] ? s.measure : "area";
    SERVICES[name] = { group: (s.group || name).trim(), measure, unit: MEASURE_UNITS[measure] };
  });
  SERVICE_NAMES.length = 0;
  SERVICE_NAMES.push(...Object.keys(SERVICES));
  ALL_SERVICES.length = 0;
  ALL_SERVICES.push(...(WARDROBE_HIDDEN ? [] : [WARDROBE_SERVICE]), ...SERVICE_NAMES);

  addedGroups.forEach((g) => { const i = GROUP_OPTIONS.indexOf(g); if (i >= 0) GROUP_OPTIONS.splice(i, 1); });
  addedGroups = [];
  SERVICE_NAMES.forEach((n) => {
    const g = SERVICES[n].group;
    if (!GROUP_OPTIONS.includes(g)) { GROUP_OPTIONS.push(g); addedGroups.push(g); }
  });
}

export const serviceOf = (box) => SERVICES[box?.serviceType] || null;

// Service an Items Pricing group belongs to: a service's own group maps to
// that service, every other group (Wood, Hardware, Carpenter, ...) is wardrobe.
export const serviceForGroup = (group) =>
  SERVICE_NAMES.find((n) => SERVICES[n].group === group) || WARDROBE_SERVICE;

// Service tag of any record carrying a `serviceType` (template, gallery group).
export const serviceTagOf = (rec) => (rec?.serviceType && SERVICES[rec.serviceType] ? rec.serviceType : WARDROBE_SERVICE);

// True when `rec` passes the chosen filter ("All" passes everything).
export const matchesService = (rec, filter) => filter === "All" || serviceTagOf(rec) === filter;

// Quantity + unit a box is measured in: sq ft for wardrobe and area services,
// running feet for length services, a typed count for point services.
export function boxQty(box) {
  const svc = serviceOf(box);
  if (svc?.measure === "points") return { qty: Number(box.serviceQty) || 0, unit: svc.unit };
  if (svc?.measure === "length") {
    const wMm = Number(box.quotationWidthMm) || 0;
    return { qty: wMm ? Math.round(mmToFeet(wMm) * 100) / 100 : 0, unit: svc.unit };
  }
  const hMm = Number(box.quotationHeightMm) || Number(box.heightMm) || 0;
  const wMm = Number(box.quotationWidthMm) || Number(box.widthMm) || 0;
  return { qty: hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0, unit: "sqft" };
}
