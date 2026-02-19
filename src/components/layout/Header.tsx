import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, Phone } from "lucide-react";
import { NAV_ITEMS, BRAND } from "@/data/content";
import { motion, AnimatePresence } from "framer-motion";

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
    setOpenDropdown(null);
  }, [location]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-card/95 backdrop-blur-md shadow-sm border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2" aria-label="Preinvesto Home">
          <span className={`font-display text-xl md:text-2xl font-bold tracking-tight transition-colors ${isScrolled ? "text-foreground" : "text-primary-foreground"}`}>
            Preinvesto
          </span>
          <span className={`hidden sm:inline text-xs font-sans font-medium tracking-widest uppercase transition-colors ${isScrolled ? "text-accent" : "text-accent"}`}>
            Interiors
          </span>
        </Link>

        {/* Desktop Nav */}
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
                className={`px-4 py-2 text-sm font-medium tracking-wide transition-colors flex items-center gap-1 ${
                  isScrolled
                    ? "text-foreground hover:text-accent"
                    : "text-primary-foreground/90 hover:text-primary-foreground"
                } ${location.pathname === item.path ? "!text-accent" : ""}`}
              >
                {item.label}
                {item.children && <ChevronDown className="w-3 h-3" />}
              </Link>

              {item.children && openDropdown === item.label && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full left-0 mt-0 bg-card rounded-lg shadow-lg border border-border py-2 min-w-[240px]"
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

        {/* CTA + Mobile Toggle */}
        <div className="flex items-center gap-3">
          <a
            href={`tel:${BRAND.phone}`}
            className={`hidden md:flex items-center gap-1.5 text-sm font-medium transition-colors ${isScrolled ? "text-foreground" : "text-primary-foreground/90"}`}
            aria-label="Call Preinvesto"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden xl:inline">{BRAND.phone}</span>
          </a>
          <Link
            to="/contact"
            className="hidden md:inline-flex items-center px-5 py-2.5 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Get Quote
          </Link>
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className={`lg:hidden p-2 transition-colors ${isScrolled ? "text-foreground" : "text-primary-foreground"}`}
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
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
                      className={`block py-3 text-base font-medium text-foreground hover:text-accent transition-colors ${location.pathname === item.path ? "text-accent" : ""}`}
                    >
                      {item.label}
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
                Get Quote
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
