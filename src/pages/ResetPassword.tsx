import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { ShieldCheck, Eye, EyeOff, CircleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthShell, { AuthInput, AuthSubmit } from "@/components/auth/AuthShell";

const MIN_PASSWORD = 8;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Someone opened /reset-password without following an emailed link.
  if (!token) {
    return (
      <AuthShell
        seoTitle="Invalid Link | Preinvesto"
        icon={<CircleAlert className="w-6 h-6 text-destructive" />}
        title="This link isn't valid"
        subtitle="The reset link is missing or incomplete."
        footer={
          <Link to="/forgot-password" className="text-accent font-semibold hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-xs text-muted-foreground text-center">
          Make sure you opened the most recent email, and that the whole link was copied.
        </p>
      </AuthShell>
    );
  }

  const mismatch = confirm !== "" && confirm !== password;
  const canSubmit = password.length >= MIN_PASSWORD && confirm === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await resetPassword(token, password);
      setDone(true);
      // Give the confirmation a beat to register before moving on.
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        seoTitle="Password Updated | Preinvesto"
        icon={<ShieldCheck className="w-6 h-6 text-accent" />}
        title="Password updated"
        subtitle="Taking you to the sign-in page..."
        footer={
          <Link to="/login" className="text-accent font-semibold hover:underline">
            Sign in now
          </Link>
        }
      >
        <p className="text-xs text-muted-foreground text-center">
          For safety, this signed out any other devices that were using the old password.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      seoTitle="Set a New Password | Preinvesto"
      icon={<ShieldCheck className="w-6 h-6 text-accent" />}
      title="Set a new password"
      subtitle="Choose a password you haven't used before."
      footer={
        <Link to="/login" className="text-accent font-semibold hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <AuthInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder={`New password (min ${MIN_PASSWORD} characters)`}
            autoComplete="new-password"
            autoFocus
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

        <AuthInput
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(""); }}
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
        />

        {mismatch && <p className="text-destructive text-xs">Passwords don't match.</p>}
        {error && <p className="text-destructive text-xs text-center">{error}</p>}

        <AuthSubmit loading={busy} loadingLabel="Updating..." disabled={!canSubmit}>
          Update Password
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
