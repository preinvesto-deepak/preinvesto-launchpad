// App Settings → Customer view: when on, each ticked item is hidden so the
// screen is safe to show a customer. Items default to hidden until unticked.
export const CUSTOMER_HIDE_ITEMS = [
  { key: "totals", label: "Total and Sft Cost rows (Room Estimation → Material Summary)" },
  { key: "summaryQty", label: "Required Qty and UOM (Room Estimation → Material Summary)" },
  { key: "analysisQty", label: "Qty and UOM (Material Analysis page)" },
  { key: "rates", label: "Rate incl. GST (Material Summary and Material Analysis)" },
  { key: "markup", label: "Markup % (Quotation page)" },
  { key: "profit", label: "Profit amount (Quotation page)" },
];
export const hideInCustomerView = (profile, key) =>
  profile?.customerView === true && profile?.customerHide?.[key] !== false;
