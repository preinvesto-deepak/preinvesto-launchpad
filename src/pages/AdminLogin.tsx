import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import SEO from "@/components/SEO";

const AdminLogin = () => {
  const { isAdmin, login, logout } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/admin/review";

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError("");
    const ok = await login(pin.trim());
    setLoading(false);
    if (ok) {
      navigate(from, { replace: true });
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    }
  }

  // Already logged in — show logout option
  if (isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <SEO title="Admin | Preinvesto" description="" />
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm text-center shadow-lg">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="font-display text-xl font-bold text-foreground mb-1">Admin Mode Active</h1>
          <p className="text-sm text-muted-foreground mb-6">You are logged in as admin.</p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/admin/review")}
              className="w-full py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
            >
              Go to Review Page
            </button>
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="w-full py-3 border border-border text-foreground rounded-lg hover:bg-muted transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <SEO title="Admin Login | Preinvesto" description="" />
      <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm shadow-lg">
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-accent" />
        </div>
        <h1 className="font-display text-xl font-bold text-foreground text-center mb-1">Admin Access</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Enter your admin PIN to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              placeholder="Enter PIN"
              autoFocus
              className="w-full border border-border rounded-lg px-4 py-3 pr-10 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-center tracking-widest text-lg"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-destructive text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
