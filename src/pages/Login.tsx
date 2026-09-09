import { useState } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthShell, { AuthInput, AuthSubmit } from "@/components/auth/AuthShell";

const Login = () => {
  const { user, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where the user was headed before being bounced here.
  const from = (location.state as { from?: string } | null)?.from || "/interior";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authLoading && user) return <Navigate to={from} replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      seoTitle="Sign In | Preinvesto"
      icon={<LogIn className="w-6 h-6 text-accent" />}
      title="Sign in"
      subtitle="Access your Interior Quotation workspace."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="text-accent font-semibold hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          placeholder="Email address"
          autoComplete="email"
          autoFocus
          required
        />

        <div className="relative">
          <AuthInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Password"
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

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-accent transition-colors">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-destructive text-xs text-center">{error}</p>}

        <AuthSubmit loading={busy} loadingLabel="Signing in..." disabled={!email.trim() || !password}>
          Sign In
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default Login;
