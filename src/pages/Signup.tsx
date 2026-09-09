import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { UserPlus, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthShell, { AuthInput, AuthSubmit } from "@/components/auth/AuthShell";

const MIN_PASSWORD = 8;

const Signup = () => {
  const { user, loading: authLoading, signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authLoading && user) return <Navigate to="/interior" replace />;

  const mismatch = confirm !== "" && confirm !== password;
  const tooShort = password !== "" && password.length < MIN_PASSWORD;
  const canSubmit =
    name.trim() !== "" && email.trim() !== "" && password.length >= MIN_PASSWORD && confirm === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await signup(name.trim(), email.trim(), password);
      navigate("/interior", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      seoTitle="Create Account | Preinvesto"
      icon={<UserPlus className="w-6 h-6 text-accent" />}
      title="Create your account"
      subtitle="Get your own Interior Quotation workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-accent font-semibold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Full name"
          autoComplete="name"
          autoFocus
          required
        />

        <AuthInput
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          placeholder="Email address"
          autoComplete="email"
          required
        />

        <div className="relative">
          <AuthInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder={`Password (min ${MIN_PASSWORD} characters)`}
            autoComplete="new-password"
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
          placeholder="Confirm password"
          autoComplete="new-password"
          required
        />

        {tooShort && (
          <p className="text-destructive text-xs">Password must be at least {MIN_PASSWORD} characters.</p>
        )}
        {mismatch && <p className="text-destructive text-xs">Passwords don't match.</p>}
        {error && <p className="text-destructive text-xs text-center">{error}</p>}

        <AuthSubmit loading={busy} loadingLabel="Creating account..." disabled={!canSubmit}>
          Create Account
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default Signup;
