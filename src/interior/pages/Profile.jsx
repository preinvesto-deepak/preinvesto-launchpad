import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "../context/AppDataContext";

const MIN_PASSWORD = 8;

// Logo crop frame is square (1:1) — a business logo is almost always shown
// in a square/round slot, unlike the 4:3 template photo cropper this is
// adapted from (see TemplateMaster.jsx's TemplateImageCropModal).
const CROP_FRAME = 220;
const CROP_OUTPUT = CROP_FRAME * 2; // 2x for a crisp small on-screen/print logo

/**
 * Drag-to-reposition + zoom cropper for the company logo — mirrors
 * TemplateImageCropModal in TemplateMaster.jsx, just square instead of 4:3.
 * Only used for uploaded files; a pasted external URL is used as-is (an
 * arbitrary cross-origin image can't be reliably read back off a canvas).
 */
function LogoCropModal({ src, onConfirm, onCancel }) {
  const imgRef = useState(() => ({ current: null }))[0];
  const [natSize, setNatSize] = useState(null); // { w, h } in natural pixels
  const [zoom, setZoom] = useState(1); // multiplier over the "fills the frame" scale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // top-left of the image, in frame px
  const [dragging, setDragging] = useState(false);
  const dragStart = useState(() => ({ current: null }))[0];

  const minScale = natSize ? Math.max(CROP_FRAME / natSize.w, CROP_FRAME / natSize.h) : 1;
  const scale = minScale * zoom;
  const scaledW = natSize ? natSize.w * scale : 0;
  const scaledH = natSize ? natSize.h * scale : 0;

  // Keeps the frame always fully covered by the image — offset can't drift
  // past an edge and leave blank space inside the crop area.
  const clamp = (value, scaledDim) => Math.min(0, Math.max(CROP_FRAME - scaledDim, value));

  const handleImgLoad = () => {
    const el = imgRef.current;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatSize({ w, h });
    const ms = Math.max(CROP_FRAME / w, CROP_FRAME / h);
    setOffset({ x: (CROP_FRAME - w * ms) / 2, y: (CROP_FRAME - h * ms) / 2 });
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offset };
  };
  const handlePointerMove = (e) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({
      x: clamp(dragStart.current.offset.x + dx, scaledW),
      y: clamp(dragStart.current.offset.y + dy, scaledH),
    });
  };
  const handlePointerUp = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const handleZoomChange = (newZoom) => {
    if (!natSize) return;
    const sw = natSize.w * minScale * newZoom;
    const sh = natSize.h * minScale * newZoom;
    setZoom(newZoom);
    setOffset((prev) => ({ x: clamp(prev.x, sw), y: clamp(prev.y, sh) }));
  };

  const handleConfirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const ctx = canvas.getContext("2d");
    // Map the visible frame back to natural-pixel coordinates in the source
    // image, so the exported crop matches what was shown, 1:1.
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sSize = CROP_FRAME / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
    onConfirm(canvas.toDataURL("image/png"));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: CROP_FRAME + 48 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Position logo</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
          Drag to reposition, use the slider to zoom or fit the logo into the square.
        </p>
        <div
          style={{
            width: CROP_FRAME, height: CROP_FRAME, overflow: "hidden", position: "relative",
            borderRadius: 8, background: "#f3f4f6", cursor: dragging ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={(el) => { imgRef.current = el; }}
            src={src}
            onLoad={handleImgLoad}
            draggable={false}
            alt=""
            style={{ position: "absolute", left: offset.x, top: offset.y, width: scaledW || "auto", height: scaledH || "auto", maxWidth: "none" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            disabled={!natSize}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={!natSize} style={{ background: "#2563eb", padding: "7px 16px", fontSize: 13 }}>Use This Logo</button>
        </div>
      </div>
    </div>
  );
}

const card = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 20 };
const cardTitle = { margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#111827" };
const cardSubtitle = { margin: "0 0 18px", fontSize: 12, color: "#6b7280" };
const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };
const inputStyle = { width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" };
const fieldRow = { marginBottom: 14 };

function Profile() {
  const { user, updateProfile, changePassword } = useAuth();
  const { companyProfile, setCompanyProfile } = useAppData();

  // ── Account details ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  // Seed the form once the session resolves — a refresh lands here before
  // /auth_me has answered, so user is null on the first render.
  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
    setMobile(user.mobile ?? "");
  }, [user]);

  const mobileValid = /^[0-9]{10}$/.test(mobile);
  const detailsDirty =
    name.trim() !== (user?.name ?? "") ||
    email.trim() !== (user?.email ?? "") ||
    mobile !== (user?.mobile ?? "");
  const canSaveDetails = name.trim() !== "" && email.trim() !== "" && mobileValid && detailsDirty;

  const handleDetails = async (e) => {
    e.preventDefault();
    if (!canSaveDetails) return;
    setSavingDetails(true);
    setDetailsError("");
    setDetailsSaved(false);
    try {
      await updateProfile(name.trim(), email.trim(), mobile);
      setDetailsSaved(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSavingDetails(false);
    }
  };

  // ── Change password ──────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const passwordMismatch = confirmPassword !== "" && confirmPassword !== newPassword;
  const canSavePassword =
    currentPassword !== "" && newPassword.length >= MIN_PASSWORD && confirmPassword === newPassword;

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!canSavePassword) return;
    setSavingPassword(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      setPasswordMessage(await changePassword(currentPassword, newPassword));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not change your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Company Details (account-wide, used on printed quotations) ──────────
  const updateCompany = (field) => (e) => setCompanyProfile((c) => ({ ...c, [field]: e.target.value }));

  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [logoUrlError, setLogoUrlError] = useState("");
  const [cropSrc, setCropSrc] = useState(null); // opens LogoCropModal when set

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    const reader = new FileReader();
    reader.onerror = () => alert("Could not read that file.");
    reader.onload = () => setCropSrc(reader.result); // opens LogoCropModal
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (dataUrl) => {
    setCompanyProfile((c) => ({ ...c, logo: dataUrl }));
    setCropSrc(null);
  };

  const handleAddLogoUrl = () => {
    const url = logoUrlInput.trim();
    if (!url) return;
    try { new URL(url); } catch { setLogoUrlError("Enter a valid URL (https://…)"); return; }
    setLogoUrlError("");
    setCompanyProfile((c) => ({ ...c, logo: url }));
    setLogoUrlInput("");
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={card}>
        <h2 style={cardTitle}>Account details</h2>
        <p style={cardSubtitle}>Your name, sign-in email and mobile number.</p>
        <form onSubmit={handleDetails}>
          <div style={fieldRow}>
            <label style={lbl}>Full name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => { setName(e.target.value); setDetailsError(""); setDetailsSaved(false); }}
              required
            />
          </div>
          <div style={fieldRow}>
            <label style={lbl}>Email address (used to sign in)</label>
            <input
              type="email"
              style={inputStyle}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setDetailsError(""); setDetailsSaved(false); }}
              required
            />
          </div>
          <div style={fieldRow}>
            <label style={lbl}>Mobile number</label>
            <input
              type="tel"
              inputMode="numeric"
              style={inputStyle}
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value.replace(/[^0-9]/g, "").slice(0, 10));
                setDetailsError("");
                setDetailsSaved(false);
              }}
              placeholder="10-digit mobile number"
              required
            />
            {mobile !== "" && !mobileValid && (
              <p style={{ color: "#dc2626", fontSize: 11, marginTop: 5 }}>Mobile number must be exactly 10 digits.</p>
            )}
          </div>

          {detailsError && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>{detailsError}</p>}
          {detailsSaved && <p style={{ color: "#059669", fontSize: 12, marginBottom: 10, fontWeight: 600 }}>✓ Profile updated.</p>}

          <button type="submit" disabled={savingDetails || !canSaveDetails} style={{ background: "#2563eb", opacity: savingDetails || !canSaveDetails ? 0.5 : 1, cursor: savingDetails || !canSaveDetails ? "not-allowed" : "pointer" }}>
            {savingDetails ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>

      <div style={card}>
        <h2 style={cardTitle}>Change password</h2>
        <p style={cardSubtitle}>Your other devices are signed out when you change it.</p>
        <form onSubmit={handlePassword}>
          <div style={{ ...fieldRow, position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              style={{ ...inputStyle, paddingRight: 36 }}
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
              placeholder="Current password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              style={{ position: "absolute", right: 6, top: 5, background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 4 }}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <div style={fieldRow}>
            <input
              type={showPassword ? "text" : "password"}
              style={inputStyle}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
              placeholder={`New password (min ${MIN_PASSWORD} characters)`}
              autoComplete="new-password"
              required
            />
          </div>

          <div style={fieldRow}>
            <input
              type={showPassword ? "text" : "password"}
              style={inputStyle}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
            />
          </div>

          {newPassword !== "" && newPassword.length < MIN_PASSWORD && (
            <p style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>Password must be at least {MIN_PASSWORD} characters.</p>
          )}
          {passwordMismatch && <p style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>Passwords do not match.</p>}
          {passwordError && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>{passwordError}</p>}
          {passwordMessage && <p style={{ color: "#059669", fontSize: 12, marginBottom: 10, fontWeight: 600 }}>✓ {passwordMessage}</p>}

          <button type="submit" disabled={savingPassword || !canSavePassword} style={{ background: "#6b7280", opacity: savingPassword || !canSavePassword ? 0.5 : 1, cursor: savingPassword || !canSavePassword ? "not-allowed" : "pointer" }}>
            {savingPassword ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>

      <div style={card}>
        <h2 style={cardTitle}>Company Details</h2>
        <p style={cardSubtitle}>Your business name, logo and contact details — used on printed quotations across every project.</p>

        <div style={fieldRow}>
          <label style={lbl}>Logo</label>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {companyProfile.logo
                ? <img src={companyProfile.logo} alt="Company logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                : <span style={{ fontSize: 24, color: "#d1d5db" }}>🏢</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  type="text"
                  placeholder="Paste logo image URL (https://…)"
                  value={logoUrlInput}
                  onChange={(e) => { setLogoUrlInput(e.target.value); setLogoUrlError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLogoUrl())}
                  style={{ ...inputStyle, borderColor: logoUrlError ? "#ef4444" : "#d1d5db" }}
                />
                <button type="button" onClick={handleAddLogoUrl} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13, flexShrink: 0 }}>Add URL</button>
              </div>
              {logoUrlError && <p style={{ color: "#dc2626", fontSize: 11, margin: "0 0 6px" }}>{logoUrlError}</p>}
              <label style={{ display: "inline-block", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "6px 14px", fontSize: 13, borderRadius: 8, cursor: "pointer" }}>
                Upload File
                <input type="file" accept="image/*" onChange={handleLogoFile} style={{ display: "none" }} />
              </label>
              {companyProfile.logo && companyProfile.logo.startsWith("data:") && (
                <button
                  type="button"
                  onClick={() => setCropSrc(companyProfile.logo)}
                  style={{ background: "none", color: "#2563eb", border: "none", fontSize: 12, cursor: "pointer", marginLeft: 10, padding: 0 }}
                >
                  Zoom / Adjust crop
                </button>
              )}
              {companyProfile.logo && (
                <button
                  type="button"
                  onClick={() => setCompanyProfile((c) => ({ ...c, logo: "" }))}
                  style={{ background: "none", color: "#dc2626", border: "none", fontSize: 12, cursor: "pointer", marginLeft: 10, padding: 0 }}
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={fieldRow}>
          <label style={lbl}>Company Name</label>
          <input style={inputStyle} type="text" value={companyProfile.name || ""} onChange={updateCompany("name")} placeholder="e.g. Interior App" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Mobile</label>
            <input style={inputStyle} type="text" value={companyProfile.mobile || ""} onChange={updateCompany("mobile")} />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input style={inputStyle} type="email" value={companyProfile.email || ""} onChange={updateCompany("email")} />
          </div>
        </div>
        <div style={fieldRow}>
          <label style={lbl}>Address</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={companyProfile.address || ""} onChange={updateCompany("address")} />
        </div>
        <div style={{ ...fieldRow, marginBottom: 0 }}>
          <label style={lbl}>GSTIN</label>
          <input style={inputStyle} type="text" value={companyProfile.gstin || ""} onChange={updateCompany("gstin")} placeholder="Optional" />
        </div>

        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 14, marginBottom: 0 }}>Saved automatically.</p>
      </div>

      {cropSrc && (
        <LogoCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}

export default Profile;
