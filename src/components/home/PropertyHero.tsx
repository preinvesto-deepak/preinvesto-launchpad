import Footer from "@/components/layout/Footer";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin } from "lucide-react";
import { IMAGES } from "@/data/content";
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
                  onClick={() => navigate(`/properties?lm=${encodeURIComponent(area)}&listing=${listing}&cat=${category}&radius=${radius}`)}
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
