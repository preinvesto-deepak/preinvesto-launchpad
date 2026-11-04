import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { GROUP_OPTIONS } from "../data/priceData";
import { ALL_SERVICES, SERVICES, MEASURE_LABELS, WARDROBE_SERVICE, serviceForGroup } from "../utils/services";

// Defines a new service (e.g. "Painting", "Plumbing"): a name, how it is
// measured, and the Items Pricing group its items live in. Saved on the
// account (companyProfile.customServices) so every screen picks it up.
// With `editing` (an existing custom service's name) it renames that service
// instead, carrying every box, template and gallery group tagged with the old
// name over to the new one. Measure and group stay fixed — items are linked
// through the group, so changing it would orphan them.
export default function AddServiceModal({ onClose, onAdded, onDeleted, editing }) {
  const { setCompanyProfile, setSubProjects, setTemplates, setDesignGallery, prices, subProjects, templates, designGallery } = useAppData();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const current = editing ? SERVICES[editing] : null;
  const [name, setName] = useState(editing || "");
  const [measure, setMeasure] = useState(current?.measure || "area");
  const [group, setGroup] = useState(current?.group || "");
  const [error, setError] = useState("");

  const n = name.trim();
  const g = (group.trim() || n);

  const save = () => {
    if (!n) { setError("Enter a service name."); return; }
    if (editing && n === editing) { onClose(); return; }
    if (n === "All" || ALL_SERVICES.some((s) => s !== editing && s.toLowerCase() === n.toLowerCase())) { setError(`"${n}" already exists.`); return; }
    if (editing === WARDROBE_SERVICE) {
      // Untagged records already mean wardrobe, so only the label changes.
      setCompanyProfile((c) => ({ ...c, wardrobeName: n }));
      onAdded?.(n);
      onClose();
      return;
    }
    if (editing) {
      const retag = (rec) => (rec.serviceType === editing ? { ...rec, serviceType: n } : rec);
      setCompanyProfile((c) => ({ ...c, customServices: (c.customServices || []).map((s) => (s.name === editing ? { ...s, name: n } : s)) }));
      setSubProjects((prev) => prev.map((r) => ({ ...r, boxes: (r.boxes || []).map(retag) })));
      setTemplates((prev) => prev.map(retag));
      setDesignGallery((prev) => prev.map(retag));
      onAdded?.(n);
      onClose();
      return;
    }
    // A group already owned by another service, or one of the built-in
    // wardrobe groups (Wood, Hardware, ...), can't also be a service's group.
    if (serviceForGroup(g) !== WARDROBE_SERVICE || GROUP_OPTIONS.includes(g)) {
      setError(`The Items Pricing group "${g}" is already used — pick a different group name.`);
      return;
    }
    setCompanyProfile((c) => ({ ...c, customServices: [...(c.customServices || []), { name: n, group: g, measure }] }));
    onAdded?.(n);
    onClose();
  };

  // Deleting: room boxes, templates and gallery groups tagged with the service
  // fall back to untagged (wardrobe); Items Pricing items are never touched, so
  // their presence blocks the delete until the owner removes them.
  const isWardrobe = editing === WARDROBE_SERVICE;
  const tagged = (rec) => (isWardrobe ? !SERVICES[rec.serviceType] : rec.serviceType === editing);
  const usage = editing ? {
    boxes: (subProjects || []).reduce((c, r) => c + (r.boxes || []).filter(tagged).length, 0),
    tpls: (templates || []).filter(tagged).length,
    gallery: (designGallery || []).filter(tagged).length,
    items: isWardrobe ? 0 : (prices || []).filter((p) => (p.group || p.category) === current?.group).length,
  } : null;

  const doDelete = () => {
    if (isWardrobe) {
      // Nothing is erased: untagged records keep behaving as wardrobe, they are
      // just no longer offered as a service choice.
      setCompanyProfile((c) => ({ ...c, wardrobeHidden: true }));
      onDeleted?.(editing);
      onClose();
      return;
    }
    setCompanyProfile((c) => ({ ...c, customServices: (c.customServices || []).filter((s) => s.name !== editing) }));
    const clear = (rec) => (rec.serviceType === editing ? { ...rec, serviceType: "" } : rec);
    setSubProjects((prev) => prev.map((r) => ({
      ...r,
      boxes: (r.boxes || []).map((b) => (b.serviceType === editing ? { ...b, serviceType: "", serviceItem: "", serviceQty: "" } : b)),
    })));
    setTemplates((prev) => prev.map(clear));
    setDesignGallery((prev) => prev.map(clear));
    onDeleted?.(editing);
    onClose();
  };

  const existingItems = (prices || []).filter((p) => (p.group || p.category) === g).length;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "95vw" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>{editing ? "Rename service" : "Add a service"}</h3>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Service name</label>
        <input
          autoFocus type="text" value={name} placeholder="e.g. Painting, Plumbing, Wall Paneling"
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
          style={{ width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 6, border: "1px solid #d1d5db", margin: "4px 0 12px", boxSizing: "border-box" }}
        />

        {editing !== WARDROBE_SERVICE && <>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Measured by</label>
        <select value={measure} disabled={!!editing} onChange={(e) => setMeasure(e.target.value)} style={{ width: "100%", padding: "8px 10px", fontSize: 13, margin: "4px 0 12px" }}>
          {Object.entries(MEASURE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Items Pricing group</label>
        <input
          type="text" value={group} disabled={!!editing} placeholder={n || "Defaults to the service name"}
          onChange={(e) => { setGroup(e.target.value); setError(""); }}
          style={{ width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 6, border: "1px solid #d1d5db", margin: "4px 0 4px", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
          Items for this service are priced in this group.{" "}
          {!editing && g && (existingItems ? `${existingItems} existing item${existingItems !== 1 ? "s" : ""} in "${g}" will be linked.` : "Add its items in Items Pricing afterwards.")}
        </div>

        </>}

        {error && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
          <button onClick={save} disabled={!n} style={{ background: "#7c3aed", padding: "7px 16px", fontSize: 13 }}>{editing ? "Save" : "Add service"}</button>
        </div>

        {usage && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
            {!confirmOpen ? (
              <button type="button" onClick={() => setConfirmOpen(true)} style={{ background: "none", color: "#dc2626", border: "none", padding: 0, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Delete this service…
              </button>
            ) : (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>Delete "{editing}"?</div>
                <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12, color: "#7f1d1d", lineHeight: 1.5 }}>
                  <li>The service disappears from every filter and Service dropdown.</li>
                  {isWardrobe && <li><b>No data is erased.</b> {usage.boxes} room box{usage.boxes !== 1 ? "es" : ""}, {usage.tpls} template{usage.tpls !== 1 ? "s" : ""} and {usage.gallery} gallery group{usage.gallery !== 1 ? "s" : ""} stay as they are and still use cut lists and sheet nesting, but you can no longer filter to them — they only show under "All". You can restore it from the Service filter row.</li>}
                  {!isWardrobe && usage.boxes > 0 && <li><b>{usage.boxes} room box{usage.boxes !== 1 ? "es" : ""}</b> will lose the service, item and quantity and turn into ordinary wardrobe boxes — they will appear in cut lists and sheet nesting, and their service pricing leaves the quotation and BOQ.</li>}
                  {!isWardrobe && usage.tpls > 0 && <li><b>{usage.tpls} template{usage.tpls !== 1 ? "s" : ""}</b> will move to {WARDROBE_SERVICE}.</li>}
                  {!isWardrobe && usage.gallery > 0 && <li><b>{usage.gallery} gallery group{usage.gallery !== 1 ? "s" : ""}</b> will move to {WARDROBE_SERVICE}.</li>}
                  {!isWardrobe && <li>This cannot be undone.</li>}
                </ul>
                {usage.items > 0 ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c" }}>
                    Cannot delete yet: {usage.items} Items Pricing item{usage.items !== 1 ? "s" : ""} in the "{current?.group}" group. Delete or move {usage.items !== 1 ? "them" : "it"} in Items Pricing first.
                  </div>
                ) : (
                  <>
                    <label style={{ fontSize: 12, color: "#374151" }}>Type <b>delete</b> to confirm</label>
                    <input
                      type="text" value={confirmText} autoFocus
                      onChange={(e) => setConfirmText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && confirmText.trim() === "delete") doDelete(); }}
                      style={{ width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #fca5a5", margin: "4px 0 8px", boxSizing: "border-box" }}
                    />
                    <button type="button" onClick={doDelete} disabled={confirmText.trim() !== "delete"}
                      style={{ background: "#dc2626", padding: "7px 16px", fontSize: 13, opacity: confirmText.trim() === "delete" ? 1 : 0.45 }}>
                      Delete service
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
