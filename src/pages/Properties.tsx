import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, MapPin, BedDouble, Bath, Maximize, X, List, Map as MapIcon, Plus, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useProperties } from "@/hooks/useProperties";
import { PROPERTY_TYPES, FURNISHING_OPTIONS, LISTED_BY_OPTIONS, STATUS_OPTIONS } from "@/data/propertiesSeed";
import type { Property } from "@/data/propertiesSeed";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SEO from "@/components/SEO";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const popupStyle = `
  @media (max-width: 1023px) {
    .custom-popup {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .custom-popup .leaflet-popup-content-wrapper,
    .custom-popup .leaflet-popup-tip-container {
      display: none !important;
    }
  }
  .custom-popup .leaflet-popup-content-wrapper {
    padding: 0 !important;
    overflow: hidden !important;
    border-radius: 10px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important;
  }
  .custom-popup .leaflet-popup-content {
    margin: 0 !important;
    width: 280px !important;
  }
  .custom-popup .leaflet-popup-close-button {
    width: 32px !important;
    height: 32px !important;
    background-color: #C2570A !important;
    color: white !important;
    font-size: 18px !important;
    font-weight: bold !important;
    border-radius: 50% !important;
    top: 8px !important;
    right: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
    z-index: 10 !important;
    border: 2px solid white !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
  }
  .custom-popup .leaflet-popup-close-button:hover {
    background-color: #a0440a !important;
  }
`;

const BUDGET_RANGES = [
  { label: "Any", min: 0, max: Infinity },
  { label: "Under \u20b925L", min: 0, max: 2500000 },
  { label: "\u20b925L \u2013 \u20b950L", min: 2500000, max: 5000000 },
  { label: "\u20b950L \u2013 \u20b91Cr", min: 5000000, max: 10000000 },
  { label: "\u20b91Cr \u2013 \u20b92Cr", min: 10000000, max: 20000000 },
  { label: "\u20b92Cr+", min: 20000000, max: Infinity },
  { label: "Under \u20b915K", min: 0, max: 15000 },
  { label: "\u20b915K \u2013 \u20b930K", min: 15000, max: 30000 },
  { label: "\u20b930K \u2013 \u20b950K", min: 30000, max: 50000 },
  { label: "\u20b950K+", min: 50000, max: Infinity },
];

const SORT_OPTIONS = [
  { label: "Newest First", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") return `\u20b9${price.toLocaleString("en-IN")}/mo`;
  if (price >= 10000000) return `\u20b9${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `\u20b9${(price / 100000).toFixed(2)} L`;
  return `\u20b9${price.toLocaleString("en-IN")}`;
}

const PropertyCard = ({ property, highlighted }: { property: Property; highlighted?: boolean }) => (
  <a
    href={`/properties/${property.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className={`block bg-card rounded-lg border overflow-hidden transition-shadow hover:shadow-lg ${highlighted ? "ring-2 ring-accent" : "border-border"}`}
  >
    <div className="relative h-48 bg-muted">
      <img src={property.featuredImage} alt={property.title} className="w-full h-full object-cover" loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
      <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded uppercase">
        {property.listingType === "rent" ? "For Rent" : "For Sale"}
      </span>
      {property.negotiable && <span className="absolute top-2 right-2 bg-card/90 text-foreground text-xs px-2 py-1 rounded">Negotiable</span>}
    </div>
    <div className="p-4 space-y-2">
      <h3 className="font-semibold text-foreground text-base line-clamp-1">{property.title}</h3>
      <p className="text-accent font-bold text-lg">{formatPrice(property.price, property.listingType)}</p>
      <div className="flex items-center gap-1 text-muted-foreground text-sm">
        <MapPin className="w-3.5 h-3.5" />
        <span className="line-clamp-1">{property.locality}, {property.city}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1 border-t border-border">
        {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{property.bedrooms} BHK</span>}
        {property.bathrooms != null && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms} Bath</span>}
        <span className="flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{property.builtUpArea} sqft</span>
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.propertyType}</span>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.furnishing}</span>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.possessionStatus}</span>
      </div>
    </div>
  </a>
);

const PopupCarousel = ({ images, badge }: { images: string[]; badge: string }) => {
  const [idx, setIdx] = useState(0);
  const all = images.filter(Boolean);
  const prev = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => (i - 1 + all.length) % all.length); };
  const next = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => (i + 1) % all.length); };
  return (
    <div style={{ position: "relative", height: "160px", overflow: "hidden", backgroundColor: "#111", userSelect: "none" }}>
      <img
        src={all[idx] || "/placeholder.svg"}
        alt="property"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
      />
      <div style={{ position: "absolute", top: "10px", left: "10px", backgroundColor: "#C2570A", color: "white", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "4px", textTransform: "uppercase", zIndex: 3 }}>
        {badge}
      </div>
      {all.length > 1 && (
        <>
          <div onClick={prev} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "40%", display: "flex", alignItems: "center", justifyContent: "flex-start", paddingLeft: "8px", cursor: "pointer", zIndex: 4, background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)" }}>
            <div style={{ backgroundColor: "rgba(0,0,0,0.6)", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,0.5)" }}>
              <ChevronLeft style={{ width: "18px", height: "18px", color: "white" }} />
            </div>
          </div>
          <div onClick={next} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "40%", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "8px", cursor: "pointer", zIndex: 4, background: "linear-gradient(to left, rgba(0,0,0,0.3), transparent)" }}>
            <div style={{ backgroundColor: "rgba(0,0,0,0.6)", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,0.5)" }}>
              <ChevronRight style={{ width: "18px", height: "18px", color: "white" }} />
            </div>
          </div>
          <div style={{ position: "absolute", bottom: "8px", right: "10px", backgroundColor: "rgba(0,0,0,0.6)", color: "white", fontSize: "11px", padding: "2px 8px", borderRadius: "4px", zIndex: 3 }}>
            {idx + 1} / {all.length}
          </div>
        </>
      )}
    </div>
  );
};

const MobileBottomSheet = ({ property, onClose }: { property: Property | null; onClose: () => void }) => {
  if (!property) return null;
  const allImages = [property.featuredImage, ...(property.galleryImages || [])].filter(Boolean);
  const badge = property.listingType === "rent" ? "For Rent" : "For Sale";
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1000, backgroundColor: "white", borderRadius: "16px 16px 0 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.2)", overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <PopupCarousel images={allImages} badge={badge} />
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "10px", right: "10px", zIndex: 10, backgroundColor: "#C2570A", border: "2px solid white", borderRadius: "50%", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}
        >
          <X style={{ width: "16px", height: "16px", color: "white" }} />
        </button>
      </div>
      <a href={`/properties/${property.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", padding: "12px 14px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#C2570A", marginBottom: "4px" }}>{formatPrice(property.price, property.listingType)}</div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", marginBottom: "3px" }}>{property.title}</div>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>{property.locality}, {property.city}</div>
        <div style={{ display: "flex", gap: "14px", fontSize: "12px", color: "#555", paddingTop: "8px", borderTop: "1px solid #f0f0f0", marginBottom: "12px" }}>
          {property.bedrooms != null && <span>{property.bedrooms} BHK</span>}
          {property.bathrooms != null && <span>{property.bathrooms} Bath</span>}
          <span>{property.builtUpArea} sqft</span>
        </div>
        <div style={{ textAlign: "center", padding: "10px", backgroundColor: "#C2570A", color: "white", fontSize: "13px", fontWeight: 600, borderRadius: "8px" }}>
          View Full Details
        </div>
      </a>
    </div>
  );
};

const MapClickHandler = ({ onMapClick }: { onMapClick: () => void }) => {
  useMapEvents({ click: onMapClick });
  return null;
};

const SelectFilter = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[];
}) => (
  <div className="relative">
    <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-card border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent w-full">
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
  </div>
);

const Properties = () => {
  const { properties } = useProperties();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"list" | "map">(searchParams.get("view") === "map" ? "map" : "list");
  const [showFilters, setShowFilters] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  const [search,       setSearch]       = useState(searchParams.get("q")          || "");
  const [listing,      setListing]      = useState(searchParams.get("listing")    || searchParams.get("type") || "");
  const [propertyType, setPropertyType] = useState(searchParams.get("proptype")   || "");
  const [budget,       setBudget]       = useState(searchParams.get("budget")     || "");
  const [bedrooms,     setBedrooms]     = useState(searchParams.get("beds")       || "");
  const [bathrooms,    setBathrooms]    = useState(searchParams.get("baths")      || "");
  const [status,       setStatus]       = useState(searchParams.get("status")     || "");
  const [furnishing,   setFurnishing]   = useState(searchParams.get("furnishing") || "");
  const [listedBy,     setListedBy]     = useState(searchParams.get("listedBy")   || "");
  const [sort,         setSort]         = useState(searchParams.get("sort")       || "newest");

  useEffect(() => {
    const params: Record<string, string> = {};
    if (view !== "list")   params.view       = view;
    if (search)            params.q          = search;
    if (listing)           params.listing    = listing;
    if (propertyType)      params.proptype   = propertyType;
    if (budget)            params.budget     = budget;
    if (bedrooms)          params.beds       = bedrooms;
    if (bathrooms)         params.baths      = bathrooms;
    if (status)            params.status     = status;
    if (furnishing)        params.furnishing = furnishing;
    if (listedBy)          params.listedBy   = listedBy;
    if (sort !== "newest") params.sort       = sort;
    setSearchParams(params, { replace: true });
  }, [view, search, listing, propertyType, budget, bedrooms, bathrooms, status, furnishing, listedBy, sort, setSearchParams]);

  const clearFilters = () => {
    setSearch(""); setListing(""); setPropertyType(""); setBudget("");
    setBedrooms(""); setBathrooms(""); setStatus(""); setFurnishing("");
    setListedBy(""); setSort("newest");
  };

  const hasActiveFilters = !!(search || listing || propertyType || budget || bedrooms || bathrooms || status || furnishing || listedBy);

  const filtered = useMemo(() => {
    let result = [...properties];
    if (listing)      result = result.filter((p) => p.listingType === listing);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.locality.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.propertyType.toLowerCase().includes(q)
      );
    }
    if (propertyType) result = result.filter((p) => p.propertyType === propertyType);
    if (bedrooms) {
      const b = parseInt(bedrooms);
      result = result.filter((p) => (b === 4 ? (p.bedrooms || 0) >= 4 : p.bedrooms === b));
    }
    if (bathrooms) {
      const b = parseInt(bathrooms);
      result = result.filter((p) => (b === 3 ? (p.bathrooms || 0) >= 3 : p.bathrooms === b));
    }
    if (status)     result = result.filter((p) => p.possessionStatus === status);
    if (furnishing) result = result.filter((p) => p.furnishing === furnishing);
    if (listedBy)   result = result.filter((p) => p.listedBy === listedBy);
    if (budget) {
      const range = BUDGET_RANGES.find((r) => r.label === budget);
      if (range) result = result.filter((p) => p.price >= range.min && p.price < range.max);
    }
    switch (sort) {
      case "price-asc":  result.sort((a, b) => a.price - b.price); break;
      case "price-desc": result.sort((a, b) => b.price - a.price); break;
      default: result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [properties, search, listing, propertyType, budget, bedrooms, bathrooms, status, furnishing, listedBy, sort]);

  const propertiesWithCoords = filtered.filter((p) => p.lat && p.lng);
  const mapCenter: [number, number] = propertiesWithCoords.length
    ? [propertiesWithCoords[0].lat!, propertiesWithCoords[0].lng!]
    : [17.4401, 78.3489];

  const budgetOptions = BUDGET_RANGES.map((r) => ({ label: r.label, value: r.label }));

  const handleMarkerClick = useCallback((p: Property) => {
    setHighlightedId(p.id);
    setSelectedProperty(p);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <style>{popupStyle}</style>
      <SEO title="Properties | Preinvesto" description="Browse properties for sale and rent in Hyderabad" />
      <Header />
      <div className="flex-1 pt-16 md:pt-20">

        <div className="bg-card border-b border-border sticky top-16 md:top-20 z-30">
          <div className="container py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex border border-border rounded-md overflow-hidden shrink-0">
              <button onClick={() => setListing("")} className={`px-3 py-2 text-sm font-medium transition-colors ${listing === "" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>ALL</button>
              <button onClick={() => setListing("sale")} className={`px-3 py-2 text-sm font-medium transition-colors ${listing === "sale" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>BUY</button>
              <button onClick={() => setListing("rent")} className={`px-3 py-2 text-sm font-medium transition-colors ${listing === "rent" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>RENT</button>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search by location, property type..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm text-foreground hover:bg-muted transition-colors lg:hidden">
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex border border-border rounded-md overflow-hidden">
                <button onClick={() => setView("list")} className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "list" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}><List className="w-4 h-4" /> LIST</button>
                <button onClick={() => setView("map")} className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "map" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}><MapIcon className="w-4 h-4" /> MAP</button>
              </div>
              <Link to="/properties/add" className="flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-md hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> ADD PROPERTY
              </Link>
            </div>
          </div>
          <div className={`border-t border-border ${showFilters ? "block" : "hidden lg:block"}`}>
            <div className="container py-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <SelectFilter label="Property Type" value={propertyType} onChange={setPropertyType} options={PROPERTY_TYPES.map((t) => ({ label: t, value: t }))} />
              <SelectFilter label="Budget" value={budget} onChange={setBudget} options={budgetOptions} />
              <SelectFilter label="Bedrooms" value={bedrooms} onChange={setBedrooms} options={[{ label: "1 BHK", value: "1" }, { label: "2 BHK", value: "2" }, { label: "3 BHK", value: "3" }, { label: "4+ BHK", value: "4" }]} />
              <SelectFilter label="Bathrooms" value={bathrooms} onChange={setBathrooms} options={[{ label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3+", value: "3" }]} />
              <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
              <SelectFilter label="Furnishing" value={furnishing} onChange={setFurnishing} options={FURNISHING_OPTIONS.map((f) => ({ label: f, value: f }))} />
              <SelectFilter label="Listed By" value={listedBy} onChange={setListedBy} options={LISTED_BY_OPTIONS.map((l) => ({ label: l, value: l }))} />
              <div className="flex items-center gap-2">
                <SelectFilter label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-2 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors whitespace-nowrap">
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {view === "list" ? (
          <div className="container py-6">
            <p className="text-sm text-muted-foreground mb-4">{filtered.length} properties found</p>
            {filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-lg font-medium">No properties match your filters</p>
                <button onClick={clearFilters} className="mt-3 text-accent underline text-sm">Clear all filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((p) => <PropertyCard key={p.id} property={p} />)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row" style={{ height: "calc(100vh - 10rem)" }}>
            <div className="flex-1 min-h-[300px] lg:min-h-0" style={{ position: "relative" }}>
              <MapContainer center={mapCenter} zoom={11} className="w-full h-full" style={{ minHeight: "300px" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler onMapClick={() => setSelectedProperty(null)} />
                {propertiesWithCoords.map((p) => {
                  const allImages = [p.featuredImage, ...(p.galleryImages || [])].filter(Boolean);
                  const badge = p.listingType === "rent" ? "For Rent" : "For Sale";
                  return (
                    <Marker
                      key={p.id}
                      position={[p.lat!, p.lng!]}
                      eventHandlers={{ click: () => handleMarkerClick(p) }}
                    >
                      {/* Desktop only popup — hidden on mobile via CSS */}
                      <Popup minWidth={280} maxWidth={280} className="custom-popup">
                        <a
                          href={`/properties/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "block", textDecoration: "none", width: "280px" }}
                        >
                          <PopupCarousel images={allImages} badge={badge} />
                          <div style={{ padding: "12px 14px", backgroundColor: "white" }}>
                            <div style={{ fontSize: "17px", fontWeight: 700, color: "#C2570A", marginBottom: "3px" }}>{formatPrice(p.price, p.listingType)}</div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", marginBottom: "3px" }}>{p.title}</div>
                            <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px" }}>{p.locality}, {p.city}</div>
                            <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#555", paddingTop: "8px", borderTop: "1px solid #f0f0f0", marginBottom: "10px" }}>
                              {p.bedrooms != null && <span>{p.bedrooms} BHK</span>}
                              {p.bathrooms != null && <span>{p.bathrooms} Bath</span>}
                              <span>{p.builtUpArea} sqft</span>
                            </div>
                            <div style={{ textAlign: "center", padding: "8px", backgroundColor: "#C2570A", color: "white", fontSize: "12px", fontWeight: 600, borderRadius: "6px" }}>
                              View Details
                            </div>
                          </div>
                        </a>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>

              {/* Mobile bottom sheet — shown only on mobile */}
              <div className="lg:hidden">
                <MobileBottomSheet
                  property={selectedProperty}
                  onClose={() => setSelectedProperty(null)}
                />
              </div>
            </div>

            {/* Desktop side list */}
            <div className="hidden lg:block w-96 xl:w-[420px] overflow-y-auto border-l border-border bg-background p-4 space-y-4">
              <p className="text-sm text-muted-foreground">{filtered.length} properties found</p>
              {filtered.map((p) => (
                <PropertyCard key={p.id} property={p} highlighted={highlightedId === p.id} />
              ))}
            </div>
          </div>
        )}
      </div>
      <WhatsAppButton />
    </div>
  );
};

export default Properties;
