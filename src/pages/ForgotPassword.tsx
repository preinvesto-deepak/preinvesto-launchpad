import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthShell, { AuthInput, AuthSubmit } from "@/components/auth/AuthShell";

const ForgotPassword = () => {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSentMessage(await forgotPassword(email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  // Confirmation is deliberately vague about whether the address exists.
  if (sentMessage) {
    return (
      <AuthShell
        seoTitle="Check Your Email | Preinvesto"
        icon={<MailCheck className="w-6 h-6 text-accent" />}
        title="Check your email"
        subtitle={sentMessage}
        footer={
          <Link to="/login" className="text-accent font-semibold hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-xs text-muted-foreground text-center">
          The link expires in 60 minutes and can only be used once. Remember to check your spam folder.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      seoTitle="Forgot Password | Preinvesto"
      icon={<KeyRound className="w-6 h-6 text-accent" />}
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link to="/login" className="text-accent font-semibold hover:underline">
          Back to sign in
        </Link>
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

        {error && <p className="text-destructive text-xs text-center">{error}</p>}

        <AuthSubmit loading={busy} loadingLabel="Sending..." disabled={!email.trim()}>
          Send Reset Link
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default ForgotPassword;
