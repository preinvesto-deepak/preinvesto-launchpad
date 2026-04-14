import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, ChevronDown, Phone, ShieldCheck } from "lucide-react";
import { NAV_ITEMS, BRAND } from "@/data/content";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "@/context/AdminContext";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdmin();
  const isHomepage = location.pathname === "/";

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    setIsScrolled(false);
    setIsMobileOpen(false);
    setOpenDropdown(null);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isTransparent = isHomepage && !isScrolled;

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: "background-color 0.3s ease, box-shadow 0.3s ease",
        backgroundColor: isTransparent ? "transparent" : "rgba(255,255,255,0.97)",
        boxShadow: isTransparent ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
        borderBottom: isTransparent ? "none" : "1px solid rgba(0,0,0,0.08)",
        backdropFilter: isTransparent ? "none" : "blur(12px)",
      }}
    >
      <div className="container flex items-center justify-between h-16 md:h-20">

        <Link to="/" className="flex items-center gap-2" aria-label="Preinvesto Home">
          <span
            style={{ transition: "color 0.3s ease", color: isTransparent ? "#ffffff" : "inherit" }}
            className="font-display text-xl md:text-2xl font-bold tracking-tight"
          >
            Preinvesto
          </span>
          <span className="hidden sm:inline text-xs font-sans font-medium tracking-widest uppercase text-accent">
            INTERIORS
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.path}
              className="relative"
              onMouseEnter={() => item.children && setOpenDropdown(item.label)}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <Link
                to={item.path}
                style={{
                  color: isTransparent
                    ? location.pathname === item.path ? "var(--accent)" : "rgba(255,255,255,0.92)"
                    : location.pathname === item.path ? "var(--accent)" : "inherit",
                  transition: "color 0.3s ease",
                }}
                className="px-4 py-2 text-sm font-medium tracking-wide flex items-center gap-1 hover:opacity-80"
              >
                {item.label.toUpperCase()}
                {item.children && <ChevronDown className="w-3 h-3" />}
              </Link>

              {item.children && openDropdown === item.label && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full left-0 mt-0 bg-card rounded-lg shadow-lg border border-border py-2 min-w-[200px] z-50"
                >
                  {item.children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      className="block px-5 py-2.5 text-sm text-foreground hover:text-accent hover:bg-muted transition-colors"
                    >
                      {child.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`tel:${BRAND.phone}`}
            style={{ color: isTransparent ? "rgba(255,255,255,0.92)" : "inherit", transition: "color 0.3s ease" }}
            className="hidden md:flex items-center gap-1.5 text-sm font-medium"
            aria-label="Call Preinvesto"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden xl:inline">{BRAND.phone}</span>
          </a>
          {isAdmin ? (
            <div className="hidden md:flex items-center gap-2">
              <Link
                to="/admin/review"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-700 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Review
              </Link>
              <button
                onClick={() => { logout(); navigate("/"); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Logout admin"
              >
                Logout
              </button>
            </div>
          ) : null}
          <Link
            to="/contact"
            className="hidden md:inline-flex items-center px-5 py-2.5 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            GET IN TOUCH WITH US
          </Link>
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            style={{ color: isTransparent ? "#ffffff" : "inherit" }}
            className="lg:hidden p-2"
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-card border-t border-border overflow-hidden"
          >
            <nav className="container py-4 space-y-1" aria-label="Mobile navigation">
              {NAV_ITEMS.map((item) => (
                <div key={item.path}>
                  <div className="flex items-center justify-between">
                    <Link
                      to={item.path}
                      className={`block py-3 text-base font-medium text-foreground hover:text-accent transition-colors ${
                        location.pathname === item.path ? "text-accent" : ""
                      }`}
                    >
                      {item.label.toUpperCase()}
                    </Link>
                    {item.children && (
                      <button
                        onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                        className="p-2 text-muted-foreground"
                        aria-label={`Expand ${item.label}`}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${openDropdown === item.label ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                  {item.children && openDropdown === item.label && (
                    <div className="pl-4 pb-2 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path}
                          className="block py-2 text-sm text-muted-foreground hover:text-accent transition-colors"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <Link
                to="/contact"
                className="block w-full text-center py-3 mt-3 bg-accent text-accent-foreground font-semibold rounded-lg"
              >
                GET IN TOUCH WITH US
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
