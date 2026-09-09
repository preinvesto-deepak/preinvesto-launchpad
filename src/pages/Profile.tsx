import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { UserCog, KeyRound, ArrowLeft, Eye, EyeOff, CircleCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SEO from "@/components/SEO";

const MIN_PASSWORD = 8;

const inputClass =
  "w-full border border-border rounded-lg px-4 py-3 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent";

const Card = ({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
    <div className="flex items-start gap-3 mb-6">
      <div className="w-10 h-10 shrink-0 bg-accent/10 rounded-full flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="font-display text-lg font-bold text-foreground leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

const Profile = () => {
  const { user, updateProfile, changePassword } = useAuth();

  // ---- details form ----
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

  // ---- password form ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const mobileValid = /^[0-9]{10}$/.test(mobile);
  const detailsDirty =
    name.trim() !== (user?.name ?? "") ||
    email.trim() !== (user?.email ?? "") ||
    mobile !== (user?.mobile ?? "");
  const canSaveDetails = name.trim() !== "" && email.trim() !== "" && mobileValid && detailsDirty;

  const passwordMismatch = confirmPassword !== "" && confirmPassword !== newPassword;
  const canSavePassword =
    currentPassword !== "" && newPassword.length >= MIN_PASSWORD && confirmPassword === newPassword;

  async function handleDetails(e: React.FormEvent) {
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
  }

  async function handlePassword(e: React.FormEvent) {
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
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <SEO title="Your Profile | Preinvesto" description="" />

      <div className="w-full max-w-lg mx-auto">
        <Link
          to="/interior"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Interior Tool
        </Link>

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Your profile</h1>

        <div className="space-y-6">
          <Card
            icon={<UserCog className="w-5 h-5 text-accent" />}
            title="Account details"
            subtitle="Your name, sign-in email and mobile number."
          >
            <form onSubmit={handleDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full name</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setDetailsError(""); setDetailsSaved(false); }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email address (used to sign in)
                </label>
                <input
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setDetailsError(""); setDetailsSaved(false); }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mobile number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  className={inputClass}
                  value={mobile}
                  // Digits only, capped at ten — the same rule the server enforces.
                  onChange={(e) => {
                    setMobile(e.target.value.replace(/[^0-9]/g, "").slice(0, 10));
                    setDetailsError("");
                    setDetailsSaved(false);
                  }}
                  placeholder="10-digit mobile number"
                  required
                />
                {mobile !== "" && !mobileValid && (
                  <p className="text-destructive text-xs mt-1.5">Mobile number must be exactly 10 digits.</p>
                )}
              </div>

              {detailsError && <p className="text-destructive text-xs">{detailsError}</p>}
              {detailsSaved && (
                <p className="text-xs flex items-center gap-1.5 text-green-600">
                  <CircleCheck className="w-3.5 h-3.5" /> Profile updated.
                </p>
              )}

              <button
                type="submit"
                disabled={savingDetails || !canSaveDetails}
                className="w-full py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingDetails ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </Card>

          <Card
            icon={<KeyRound className="w-5 h-5 text-accent" />}
            title="Change password"
            subtitle="Your other devices are signed out when you change it."
          >
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className={inputClass}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
                  placeholder="Current password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <input
                type={showPassword ? "text" : "password"}
                className={inputClass}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
                placeholder={`New password (min ${MIN_PASSWORD} characters)`}
                autoComplete="new-password"
                required
              />

              <input
                type={showPassword ? "text" : "password"}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); setPasswordMessage(""); }}
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
              />

              {newPassword !== "" && newPassword.length < MIN_PASSWORD && (
                <p className="text-destructive text-xs">Password must be at least {MIN_PASSWORD} characters.</p>
              )}
              {passwordMismatch && <p className="text-destructive text-xs">Passwords do not match.</p>}
              {passwordError && <p className="text-destructive text-xs">{passwordError}</p>}
              {passwordMessage && (
                <p className="text-xs flex items-center gap-1.5 text-green-600">
                  <CircleCheck className="w-3.5 h-3.5" /> {passwordMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPassword || !canSavePassword}
                className="w-full py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
