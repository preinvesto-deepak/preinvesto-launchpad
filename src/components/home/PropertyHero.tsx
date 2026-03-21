import Footer from "@/components/layout/Footer";
import { useState } from "react";
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

const TABS = [
  { label: "Buy", listingType: "sale" },
  { label: "Rent", listingType: "rent" },
  { label: "New Projects", listingType: "new" },
];

const POPULAR = [
  "Gachibowli", "Jubilee Hills", "Kondapur", "Banjara Hills",
  "Hitech City", "Madhapur", "Kompally", "Miyapur",
];

const PropertyHero = () => {
  const navigate = useNavigate();
  const { properties } = useProperties();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (TABS[activeTab].listingType !== "new") {
      params.set("listing", TABS[activeTab].listingType);
    }
    navigate(`/properties?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
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
              overflow: "hidden",
              maxWidth: "760px",
              margin: "0 auto 40px auto",
              borderRadius: "16px",
            }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
              {TABS.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  style={{
                    flex: 1,
                    padding: "14px 0",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: "none",
                    borderBottom: activeTab === i ? "2px solid #C2570A" : "2px solid transparent",
                    cursor: "pointer",
                    backgroundColor: activeTab === i ? "#fff7ed" : "white",
                    color: activeTab === i ? "#C2570A" : "#666",
                    transition: "all 0.2s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px" }}>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  backgroundColor: "#f8f8f8",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  padding: "12px 16px",
                }}
              >
                <MapPin style={{ width: "18px", height: "18px", color: "#C2570A", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search by locality, project or property type..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ flex: 1, border: "none", background: "transparent", fontSize: "14px", color: "#1a1a1a", outline: "none" }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#999", fontSize: "12px" }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 24px",
                  backgroundColor: "#C2570A",
                  color: "white",
                  fontWeight: 600,
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Search style={{ width: "16px", height: "16px" }} />
                Search
              </button>
            </div>

            {/* Popular localities */}
            <div style={{ padding: "0 16px 16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#999", alignSelf: "center" }}>Popular:</span>
              {POPULAR.map(area => (
                <button
                  key={area}
                  onClick={() => navigate(`/properties?q=${area}`)}
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
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
