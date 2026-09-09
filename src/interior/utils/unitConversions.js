export function mmToFeet(mm) {
  return Number(mm || 0) / 304.8;
}

export function sqMmToSqFt(sqMm) {
  return Number(sqMm || 0) / 92903.04;
}

export function feetToMm(feet) {
  return Number(feet || 0) * 304.8;
}

export function roundTo2(value) {
  return Number(value || 0).toFixed(2);
}

export function formatCurrency(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}