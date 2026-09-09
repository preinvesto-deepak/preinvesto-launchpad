import { Link } from "react-router-dom";
import SEO from "@/components/SEO";

/** Shared centred-card frame for the sign-in / sign-up / password screens. */
const AuthShell = ({
  icon,
  title,
  subtitle,
  seoTitle,
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  seoTitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
    <SEO title={seoTitle} description="" />
    <div className="w-full max-w-sm">
      <Link
        to="/"
        className="block text-center font-display text-2xl font-bold tracking-tight mb-6 hover:opacity-80 transition-opacity"
      >
        Preinvesto
      </Link>

      <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          {icon}
        </div>
        <h1 className="font-display text-xl font-bold text-foreground text-center mb-1">{title}</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">{subtitle}</p>
        {children}
      </div>

      {footer && <div className="text-center text-sm text-muted-foreground mt-6">{footer}</div>}
    </div>
  </div>
);

/** Consistent text input for the auth forms. */
export const AuthInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full border border-border rounded-lg px-4 py-3 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
  />
);

/** Primary submit button, with a busy label. */
export const AuthSubmit = ({
  loading,
  children,
  loadingLabel,
  disabled,
}: {
  loading: boolean;
  children: React.ReactNode;
  loadingLabel: string;
  disabled?: boolean;
}) => (
  <button
    type="submit"
    disabled={loading || disabled}
    className="w-full py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading ? loadingLabel : children}
  </button>
);

export default AuthShell;
