import Footer from "@/components/layout/Footer";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin } from "lucide-react";
import { IMAGES, BRAND } from "@/data/content";
import { useProperties } from "@/hooks/useProperties";
import ServicesPreview from "@/components/home/ServicesPreview";
import VideoShowcase from "@/components/home/VideoShowcase";
import PortfolioPreview from "@/components/home/PortfolioPreview";
import JourneySteps from "@/components/home/JourneySteps";
import Testimonials from "@/components/home/Testimonials";
import TrustSection from "@/components/home/TrustSection";
import ContactTeaser from "@/components/home/ContactTeaser";
import { getPlacePredictions, getPlaceDetails } from "@/hooks/useGooglePlaces";
import type { GooglePlace, PlacePrediction } from "@/hooks/useGooglePlaces";

const LISTING_TABS = [
  { label: "Buy",          value: "sale" },
  { label: "Rent",         value: "rent" },
  { label: "New Projects", value: "new"  },
];

const CATEGORY_TABS = [
  { label: "Building",   value: "building"   },
  { label: "Plot",       value: "plot"       },
  { label: "Commercial", value: "commercial" },
];

const POPULAR = [
  "Gachibowli", "Jubilee Hills", "Kondapur", "Banjara Hills",
  "Hitech City", "Madhapur", "Kompally", "Miyapur",
];

const PropertyHero = () => {
  const navigate = useNavigate();
  const { properties } = useProperties();

  // Default: BUY + BUILDING
  const [listing,  setListing]  = useState("sale");
  const [category, setCategory] = useState("building");
  const [search,   setSearch]   = useState("");
  const [radius,   setRadius]   = useState(5);
  const [selectedPlace, setSelectedPlace] = useState<GooglePlace | null>(null);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchPredictions = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setPredictions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(() => {
      getPlacePredictions(value, (preds) => {
        setPredictions(preds);
        setShowDropdown(preds.length > 0);
      });
    }, 300);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearch(v);
    setSelectedPlace(null);
    fetchPredictions(v);
  };

  const handleSelectPrediction = (pred: PlacePrediction) => {
    setSearch(pred.description);
    setPredictions([]);
    setShowDropdown(false);
    getPlaceDetails(pred.placeId, (place) => {
      if (place) setSelectedPlace(place);
    });
  };

  const handleSearch = () => {
    setShowDropdown(false);
    const params = new URLSearchParams();
    if (search.trim()) params.set("lm", search.trim());
    params.set("listing", listing);
    params.set("cat", category);
    params.set("radius", String(radius));
    if (selectedPlace) {
      params.set("lat", String(selectedPlace.lat));
      params.set("lng", String(selectedPlace.lng));
    }
    params.set("view", "map");
    navigate(`/properties?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setShowDropdown(false);
  };

  const forSale = properties.filter(p => p.listingType === "sale").length;
  const forRent = properties.filter(p => p.listingType === "rent").length;

  return (
    <div style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>

      {/* Hero — full viewport height */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          margin: 0,
          padding: 0,
        }}
      >
        {/* Background */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <img
            src={IMAGES.hero}
            alt="Find your perfect property in Hyderabad"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
            loading="eager"
          />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.50)" }} />
        </div>

        {/* Content */}
        <div
          className="container"
          style={{ position: "relative", zIndex: 10, paddingTop: "100px", paddingBottom: "60px", textAlign: "center" }}
        >
          {/* Search Card */}
          <div
            style={{
              backgroundColor: "white",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              maxWidth: "800px",
              margin: "0 auto 40px auto",
              borderRadius: "16px",
            }}
          >
            {/* Row 1: BUY / RENT / NEW PROJECTS */}
            <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
              {LISTING_TABS.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setListing(tab.value)}
                  style={{
                    flex: 1,
                    padding: "14px 0",
                    fontSize: "14px",
                    fontWeight: 700,
                    border: "none",
                    borderBottom: listing === tab.value ? "3px solid #C2570A" : "3px solid transparent",
                    cursor: "pointer",
                    backgroundColor: listing === tab.value ? "#fff7ed" : "white",
                    color: listing === tab.value ? "#C2570A" : "#666",
                    transition: "all 0.2s",
                    letterSpacing: "0.03em",
                  }}
                >
                  {tab.label.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Row 2: BUILDING / PLOT / COMMERCIAL */}
            <div style={{ display: "flex", gap: "8px", padding: "12px 16px 8px", borderBottom: "1px solid #f0f0f0" }}>
              {CATEGORY_TABS.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  style={{
                    padding: "6px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: category === cat.value ? "2px solid #C2570A" : "2px solid #e5e7eb",
                    borderRadius: "9999px",
                    cursor: "pointer",
                    backgroundColor: category === cat.value ? "#C2570A" : "white",
                    color: category === cat.value ? "white" : "#555",
                    transition: "all 0.2s",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Row 3: Search input + radius + button */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px" }}>
              {/* Search input with custom autocomplete dropdown */}
              <div ref={wrapperRef} style={{ flex: 1, position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    backgroundColor: "#f8f8f8",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "10px 14px",
                  }}
                >
                  <MapPin style={{ width: "18px", height: "18px", color: "#C2570A", flexShrink: 0 }} />
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Search locality, landmark or project name..."
                    value={search}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                    style={{ flex: 1, border: "none", background: "transparent", fontSize: "14px", color: "#1a1a1a", outline: "none", minWidth: 0 }}
                  />
                  {search && (
                    <button onClick={() => { setSearch(""); setPredictions([]); setShowDropdown(false); setSelectedPlace(null); }}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#999", fontSize: "14px", flexShrink: 0 }}>✕</button>
                  )}
                </div>

                {/* Custom predictions dropdown */}
                {showDropdown && predictions.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
                    zIndex: 9999,
                    overflow: "hidden",
                  }}>
                    {predictions.map((pred, i) => (
                      <div
                        key={pred.placeId}
                        onMouseDown={() => handleSelectPrediction(pred)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderTop: i > 0 ? "1px solid #f3f4f6" : "none",
                          backgroundColor: "white",
                          transition: "background-color 0.1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fff7ed")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "white")}
                      >
                        <MapPin style={{ width: "15px", height: "15px", color: "#C2570A", flexShrink: 0, marginTop: "2px" }} />
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>{pred.mainText}</div>
                          {pred.secondaryText && (
                            <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{pred.secondaryText}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Radius field — always visible */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={radius}
                  onChange={e => setRadius(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: "52px",
                    padding: "10px 6px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "14px",
                    textAlign: "center",
                    outline: "none",
                    backgroundColor: "#f8f8f8",
                  }}
                />
                <span style={{ fontSize: "12px", color: "#888", whiteSpace: "nowrap" }}>km</span>
              </div>

              <button
                onClick={handleSearch}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 22px",
                  backgroundColor: "#C2570A",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  flexShrink: 0,
                  letterSpacing: "0.03em",
                }}
              >
                <Search style={{ width: "16px", height: "16px" }} />
                SEARCH
              </button>
            </div>

            {/* Popular localities */}
            <div style={{ padding: "0 16px 14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#999", alignSelf: "center" }}>Popular:</span>
              {POPULAR.map(area => (
                <button
                  key={area}
                  onClick={() => navigate(`/properties?lm=${encodeURIComponent(area)}&listing=${listing}&cat=${category}&radius=${radius}&view=map`)}
                  style={{
                    fontSize: "12px",
                    padding: "5px 12px",
                    backgroundColor: "#f3f4f6",
                    color: "#555",
                    border: "none",
                    borderRadius: "9999px",
                    cursor: "pointer",
                  }}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          {/* Heading below search */}
          <p style={{ color: "#C2570A", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "13px", marginBottom: "12px" }}>
            Hyderabad's Trusted Property Portal
          </p>
          <h1
            className="font-display"
            style={{ color: "white", fontWeight: 700, lineHeight: 1.15, marginBottom: "16px", fontSize: "clamp(2rem, 5vw, 3.75rem)" }}
          >
            Your Home Journey, Simplified.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "18px", maxWidth: "520px", margin: "0 auto 40px auto" }}>
            Search properties for sale, rent and new projects across Hyderabad
          </p>

          {/* Live stats */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "32px" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "white", fontWeight: 700, fontSize: "28px", margin: 0 }}>{forSale}+</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Properties for Sale</p>
            </div>
            <div style={{ width: "1px", height: "40px", backgroundColor: "rgba(255,255,255,0.2)" }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "white", fontWeight: 700, fontSize: "28px", margin: 0 }}>{forRent}+</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Properties for Rent</p>
            </div>
            <div style={{ width: "1px", height: "40px", backgroundColor: "rgba(255,255,255,0.2)" }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "white", fontWeight: 700, fontSize: "28px", margin: 0 }}>10+</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Localities Covered</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services — reusing existing ServicesPreview component (matches live site exactly) */}
      <ServicesPreview />

      {/* List your property CTA */}
      <section className="py-10 lg:py-14 bg-background">
        <div className="container">
          {/* Section heading */}
          <div className="text-center max-w-2xl mx-auto mb-8">
            <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">List With Us</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Want to List Your Property?
            </h2>
            <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
              Reach thousands of genuine buyers and renters across Hyderabad. Share your property details with us and we'll handle the rest.
            </p>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                key: "call",
                path: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
                title: "Call us",
                desc: "Call our listing team and share your property details — location, size, price, and type.",
                cta: "Call now", href: `tel:${BRAND.phone.replace(/\s/g, "")}`, external: true,
              },
              {
                key: "whatsapp",
                path: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
                title: "WhatsApp",
                desc: "Message us on WhatsApp with details and photos for a quick, easy listing process.",
                cta: "Chat now", href: BRAND.whatsappLink, external: true,
              },
              {
                key: "add",
                path: "M12 4.5v15m7.5-7.5h-15",
                title: "Add it yourself",
                desc: "Agents and owners can submit listings directly using our online property form.",
                cta: "Add property", href: "/add-property", external: false,
              },
            ].map(({ key, path, title, desc, cta, href, external }) => (
              <a
                key={key}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="text-center relative group block"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-section-alt group-hover:bg-accent/10 transition-colors flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
                  </svg>
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{desc}</p>
                <span className="text-sm font-medium text-accent group-hover:underline">
                  {cta} →
                </span>
              </a>
            ))}
          </div>

          {/* Note */}
          <p className="text-center text-xs text-muted-foreground mt-12">
            * Your property will be live after review by our team.
          </p>
        </div>
      </section>

      <VideoShowcase />
      <PortfolioPreview />
      <JourneySteps />
      <Testimonials />
      <TrustSection />
      <ContactTeaser />
      <Footer />
    </div>
  );
};

export default PropertyHero;
