import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { getPlacePredictions, getPlaceDetails } from "@/hooks/useGooglePlaces";
import type { PlacePrediction } from "@/hooks/useGooglePlaces";
import { Link, useSearchParams } from "react-router-dom";
import { Search, MapPin, BedDouble, Bath, Maximize, X, List, Map as MapIcon, Plus, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useProperties } from "@/hooks/useProperties";
import { FURNISHING_OPTIONS, LISTED_BY_OPTIONS } from "@/data/propertiesSeed";
import type { Property } from "@/data/propertiesSeed";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SEO from "@/components/SEO";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Default blue marker (explicit instance so we never pass undefined to Leaflet)
const defaultMarkerIcon = new L.Icon.Default();

// Red marker for sold/rented properties
const redMarkerIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
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

const SORT_OPTIONS = [
  { label: "Newest First", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

// Haversine distance in km between two lat/lng pairs
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Dual range slider component
const DualRangeSlider = ({
  label, min, max, low, high, step, format,
  onLow, onHigh,
}: {
  label: string; min: number; max: number; low: number; high: number; step: number;
  format: (v: number) => string; onLow: (v: number) => void; onHigh: (v: number) => void;
}) => {
  const lowPct  = ((low  - min) / (max - min)) * 100;
  const highPct = ((high - min) / (max - min)) * 100;
  return (
    <div className="px-1">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-accent mb-1">{format(low)} – {format(high)}</p>
      <div className="relative h-5 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted" />
        <div className="absolute h-1.5 rounded-full bg-accent" style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }} />
        <input type="range" min={min} max={max} step={step} value={low}
          onChange={e => { const v = Number(e.target.value); if (v <= high) onLow(v); }}
          className="absolute w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
          style={{ zIndex: low > max - step ? 5 : 3 }}
        />
        <input type="range" min={min} max={max} step={step} value={high}
          onChange={e => { const v = Number(e.target.value); if (v >= low) onHigh(v); }}
          className="absolute w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md"
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
};

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") return `₹${price.toLocaleString("en-IN")}/mo`;
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString("en-IN")}`;
}

function formatLakhCr(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(1)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

const SoldStamp = ({ label }: { label: string }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
    <div style={{
      transform: "rotate(-25deg)",
      border: "4px solid rgba(220,38,38,0.9)",
      color: "rgba(220,38,38,0.9)",
      fontSize: "28px",
      fontWeight: 900,
      padding: "4px 20px",
      letterSpacing: "6px",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.15)",
      backdropFilter: "blur(1px)",
      textShadow: "0 1px 3px rgba(0,0,0,0.4)",
      userSelect: "none",
      whiteSpace: "nowrap",
    }}>
      {label}
    </div>
  </div>
);

const PropertyCard = ({ property, highlighted }: { property: Property; highlighted?: boolean }) => {
  const isSold   = property.status === 'sold';
  const isRented = property.status === 'rented';
  const isPlot   = property.propertyCategory === 'plot';
  const isRent   = property.listingType === 'rent';

  // Cost per sft (building/commercial, sale)
  const costPerSft = !isPlot && !isRent && property.builtUpArea > 0
    ? property.price / property.builtUpArea : null;
  // Cost per sq yard (plot, sale)
  const costPerSqYard = isPlot && !isRent && property.plotArea && property.plotArea > 0
    ? property.price / property.plotArea : null;
  // Rent per sft (building/commercial, rent)
  const rentPerSft = !isPlot && isRent && property.builtUpArea > 0 && property.rentPerMonth
    ? property.rentPerMonth / property.builtUpArea : null;
  // Rent per sq yard (plot, rent)
  const rentPerSqYard = isPlot && isRent && property.plotArea && property.plotArea > 0 && property.rentPerMonth
    ? property.rentPerMonth / property.plotArea : null;

  return (
  <a
    href={`/properties/${property.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className={`block bg-card rounded-lg border overflow-hidden transition-shadow hover:shadow-lg ${highlighted ? "ring-2 ring-accent" : "border-border"}`}
  >
    <div className="relative h-48 bg-muted">
      <img src={property.featuredImage} alt={property.title} className={`w-full h-full object-cover ${(isSold || isRented) ? "opacity-70" : ""}`} loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
      {isSold   && <SoldStamp label="SOLD"   />}
      {isRented && <SoldStamp label="RENTED" />}
      <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded uppercase">
        {isRent ? "For Rent" : "For Sale"}
      </span>
      {property.negotiable && <span className="absolute top-2 right-2 bg-card/90 text-foreground text-xs px-2 py-1 rounded">Negotiable</span>}
    </div>
    <div className="p-4 space-y-2">
      <h3 className="font-semibold text-foreground text-base line-clamp-1">{property.title}</h3>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-accent font-bold text-lg">{formatPrice(property.price, property.listingType)}</p>
        {costPerSft    && <span className="text-xs text-muted-foreground">₹{Math.round(costPerSft).toLocaleString("en-IN")}/sft</span>}
        {costPerSqYard && <span className="text-xs text-muted-foreground">₹{Math.round(costPerSqYard).toLocaleString("en-IN")}/sq yd</span>}
        {rentPerSft    && <span className="text-xs text-muted-foreground">₹{Math.round(rentPerSft).toLocaleString("en-IN")}/sft/mo</span>}
        {rentPerSqYard && <span className="text-xs text-muted-foreground">₹{Math.round(rentPerSqYard).toLocaleString("en-IN")}/sq yd/mo</span>}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground text-sm">
        <MapPin className="w-3.5 h-3.5" />
        <span className="line-clamp-1">{property.locality}, {property.city}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1 border-t border-border flex-wrap">
        {isPlot ? (
          <>
            {property.plotArea != null && <span className="flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{property.plotArea} sq.yd</span>}
            {property.plotLength != null && property.plotWidth != null && <span>{property.plotLength}×{property.plotWidth} ft</span>}
          </>
        ) : (
          <>
            {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{property.bedrooms} BHK</span>}
            {property.bathrooms != null && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms} Bath</span>}
            <span className="flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{property.builtUpArea} sqft</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.propertyType}</span>
        {!isPlot && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.furnishing}</span>}
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.possessionStatus}</span>
      </div>
    </div>
  </a>
  );
};

const PopupCarousel = ({ images, badge }: { images: string[]; badge: string }) => {
  const [idx, setIdx] = useState(0);
  const all = images.filter(Boolean);
  const isSoldRented = badge === 'SOLD' || badge === 'RENTED';
  const prev = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => (i - 1 + all.length) % all.length); };
  const next = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIdx(i => (i + 1) % all.length); };
  return (
    <div style={{ position: "relative", height: "160px", overflow: "hidden", backgroundColor: "#111", userSelect: "none" }}>
      <img
        src={all[idx] || "/placeholder.svg"}
        alt="property"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none", opacity: isSoldRented ? 0.7 : 1 }}
        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
      />
      {isSoldRented && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 3 }}>
          <div style={{ transform: "rotate(-25deg)", border: "3px solid rgba(220,38,38,0.9)", color: "rgba(220,38,38,0.9)", fontSize: "22px", fontWeight: 900, padding: "3px 16px", letterSpacing: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(1px)", textShadow: "0 1px 3px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
            {badge}
          </div>
        </div>
      )}
      <div style={{ position: "absolute", top: "10px", left: "10px", backgroundColor: isSoldRented ? "#dc2626" : "#C2570A", color: "white", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "4px", textTransform: "uppercase", zIndex: 4 }}>
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
  const isSoldRented = property.status === 'sold' || property.status === 'rented';
  const badge = isSoldRented
    ? (property.status === 'sold' ? 'SOLD' : 'RENTED')
    : (property.listingType === "rent" ? "For Rent" : "For Sale");
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
          {property.propertyCategory === 'plot' ? (
            <>
              {property.plotArea != null && <span>{property.plotArea} sq.yd</span>}
              {property.plotLength != null && property.plotWidth != null && <span>{property.plotLength}×{property.plotWidth} ft</span>}
            </>
          ) : (
            <>
              {property.bedrooms != null && <span>{property.bedrooms} BHK</span>}
              {property.bathrooms != null && <span>{property.bathrooms} Bath</span>}
              <span>{property.builtUpArea} sqft</span>
            </>
          )}
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

// Price range presets per context
const PRICE_RANGES = {
  sale_building:   { min: 0, max: 50000000, step: 500000 },
  sale_plot:       { min: 0, max: 20000000, step: 200000 },
  sale_commercial: { min: 0, max: 100000000, step: 1000000 },
  rent_building:   { min: 0, max: 200000, step: 1000 },
  rent_commercial: { min: 0, max: 500000, step: 5000 },
  rent_plot:       { min: 0, max: 100000, step: 1000 },
};

// Cost/sft ranges
const SFT_RANGES = {
  sale: { min: 0, max: 30000, step: 500 },
  rent: { min: 0, max: 200, step: 5 },
};

// Cost/sq yard ranges (plot)
const SQYARD_RANGES = {
  sale: { min: 0, max: 200000, step: 2000 },
  rent: { min: 0, max: 5000, step: 100 },
};

function formatSliderPrice(v: number, isRent: boolean) {
  if (isRent) return `₹${v.toLocaleString("en-IN")}`;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(0)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

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

  // Tab state — default BUY + BUILDING if no URL params
  const [listing,  setListing]  = useState<"" | "sale" | "rent" | "new">(
    (searchParams.get("listing") || searchParams.get("type") || "sale") as any
  );
  const [category, setCategory] = useState<"" | "building" | "plot" | "commercial">(
    (searchParams.get("cat") || "building") as any
  );

  // Landmark/radius search
  const [landmark,       setLandmark]       = useState(searchParams.get("lm") || "");
  const [radiusKm,       setRadiusKm]       = useState(searchParams.get("radius") ? Number(searchParams.get("radius")) : 5);
  const initLat = searchParams.get("lat") ? Number(searchParams.get("lat")) : null;
  const initLng = searchParams.get("lng") ? Number(searchParams.get("lng")) : null;
  const [landmarkCoords, setLandmarkCoords] = useState<{ lat: number; lng: number } | null>(
    initLat && initLng ? { lat: initLat, lng: initLng } : null
  );
  const [lmPredictions,  setLmPredictions]  = useState<PlacePrediction[]>([]);
  const [showLmDropdown, setShowLmDropdown] = useState(false);
  const lmDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lmWrapperRef   = useRef<HTMLDivElement>(null);

  // Close landmark dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (lmWrapperRef.current && !lmWrapperRef.current.contains(e.target as Node))
        setShowLmDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLandmarkChange = useCallback((value: string) => {
    setLandmark(value);
    setSearch(value);
    setLandmarkCoords(null);
    if (lmDebounceRef.current) clearTimeout(lmDebounceRef.current);
    if (!value.trim()) { setLmPredictions([]); setShowLmDropdown(false); return; }
    lmDebounceRef.current = setTimeout(() => {
      getPlacePredictions(value, (preds) => {
        setLmPredictions(preds);
        setShowLmDropdown(preds.length > 0);
      });
    }, 300);
  }, []);

  const handleLmSelect = useCallback((pred: PlacePrediction) => {
    setLandmark(pred.description);
    setSearch(pred.description);
    setLmPredictions([]);
    setShowLmDropdown(false);
    getPlaceDetails(pred.placeId, (place) => {
      if (place) setLandmarkCoords({ lat: place.lat, lng: place.lng });
    });
  }, []);

  // Text search
  const [search, setSearch] = useState(searchParams.get("q") || "");

  // Price sliders — we use max as "no limit" sentinel
  const isRent = listing === "rent";
  const prCtx = `${isRent ? "rent" : "sale"}_${category || "building"}` as keyof typeof PRICE_RANGES;
  const prRange = PRICE_RANGES[prCtx] ?? PRICE_RANGES.sale_building;
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(prRange.max);

  // Cost/sft slider
  const sftRange = SFT_RANGES[isRent ? "rent" : "sale"];
  const [sftMin, setSftMin] = useState(0);
  const [sftMax, setSftMax] = useState(sftRange.max);

  // Cost/sq yard slider
  const sqYardRange = SQYARD_RANGES[isRent ? "rent" : "sale"];
  const [sqYardMin, setSqYardMin] = useState(0);
  const [sqYardMax, setSqYardMax] = useState(sqYardRange.max);

  // Additional filters
  const [bedrooms,   setBedrooms]   = useState(searchParams.get("beds")       || "");
  const [furnishing, setFurnishing] = useState(searchParams.get("furnishing") || "");
  const [listedBy,   setListedBy]   = useState(searchParams.get("listedBy")   || "");
  const [sort,       setSort]       = useState(searchParams.get("sort")       || "newest");

  // Reset sliders when context changes
  useEffect(() => {
    const ctx = `${isRent ? "rent" : "sale"}_${category || "building"}` as keyof typeof PRICE_RANGES;
    const pr = PRICE_RANGES[ctx] ?? PRICE_RANGES.sale_building;
    setPriceMin(0);
    setPriceMax(pr.max);
    const sfr = SFT_RANGES[isRent ? "rent" : "sale"];
    setSftMin(0); setSftMax(sfr.max);
    const syr = SQYARD_RANGES[isRent ? "rent" : "sale"];
    setSqYardMin(0); setSqYardMax(syr.max);
  }, [listing, category]);


  useEffect(() => {
    const params: Record<string, string> = {};
    if (view !== "list")   params.view       = view;
    if (search)            params.q          = search;
    if (listing)           params.listing    = listing;
    if (category)          params.cat        = category;
    if (landmark)          params.lm         = landmark;
    if (radiusKm !== 5)    params.radius     = String(radiusKm);
    if (bedrooms)          params.beds       = bedrooms;
    if (furnishing)        params.furnishing = furnishing;
    if (listedBy)          params.listedBy   = listedBy;
    if (sort !== "newest") params.sort       = sort;
    setSearchParams(params, { replace: true });
  }, [view, search, listing, category, landmark, radiusKm, bedrooms, furnishing, listedBy, sort, setSearchParams]);

  const clearFilters = () => {
    setSearch(""); setListing(""); setCategory(""); setLandmark(""); setRadiusKm(5);
    setLandmarkCoords(null); setBedrooms(""); setFurnishing(""); setListedBy(""); setSort("newest");
    const pr = PRICE_RANGES.sale_building;
    setPriceMin(0); setPriceMax(pr.max);
    setSftMin(0); setSftMax(SFT_RANGES.sale.max);
    setSqYardMin(0); setSqYardMax(SQYARD_RANGES.sale.max);
  };

  const hasActiveFilters = !!(search || listing || category || landmark || bedrooms || furnishing || listedBy);

  const priceEffMax = PRICE_RANGES[prCtx]?.max ?? prRange.max;
  const sftEffMax   = SFT_RANGES[isRent ? "rent" : "sale"].max;
  const sqYardEffMax = SQYARD_RANGES[isRent ? "rent" : "sale"].max;

  const filtered = useMemo(() => {
    let result = [...properties];

    // Listing type tab
    if (listing === "new") result = result.filter((p) => p.isNewProject);
    else if (listing)      result = result.filter((p) => p.listingType === listing);

    // Category sub-tab (null/undefined propertyCategory treated as "building")
    if (category) result = result.filter((p) => (p.propertyCategory ?? "building") === category);

    // Text search or landmark search
    if (landmarkCoords && landmark.trim()) {
      result = result.filter((p) =>
        p.lat && p.lng &&
        haversineKm(landmarkCoords.lat, landmarkCoords.lng, p.lat, p.lng) <= radiusKm
      );
    } else if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.locality.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.propertyType.toLowerCase().includes(q) ||
        (p.landmark ?? "").toLowerCase().includes(q)
      );
    }

    // Price sliders
    const usePrice = listing !== "rent";
    const useRent  = listing === "rent";
    if (priceMax < priceEffMax || priceMin > 0) {
      if (usePrice) result = result.filter((p) => p.price >= priceMin && p.price <= priceMax);
      if (useRent)  result = result.filter((p) => (p.rentPerMonth ?? 0) >= priceMin && (p.rentPerMonth ?? 0) <= priceMax);
    }

    // Cost per sft slider
    if (category !== "plot") {
      if (sftMax < sftEffMax || sftMin > 0) {
        result = result.filter((p) => {
          if (!p.builtUpArea) return true;
          const base = useRent ? (p.rentPerMonth ?? 0) : p.price;
          const perSft = base / p.builtUpArea;
          return perSft >= sftMin && perSft <= sftMax;
        });
      }
    }

    // Cost per sq yard slider
    if (category === "plot") {
      if (sqYardMax < sqYardEffMax || sqYardMin > 0) {
        result = result.filter((p) => {
          if (!p.plotArea) return true;
          const base = useRent ? (p.rentPerMonth ?? 0) : p.price;
          const perSqYd = base / p.plotArea;
          return perSqYd >= sqYardMin && perSqYd <= sqYardMax;
        });
      }
    }

    // Bedrooms
    if (bedrooms) {
      const b = parseInt(bedrooms);
      result = result.filter((p) => (b === 4 ? (p.bedrooms || 0) >= 4 : p.bedrooms === b));
    }

    if (furnishing) result = result.filter((p) => p.furnishing === furnishing);
    if (listedBy)   result = result.filter((p) => p.listedBy === listedBy);

    switch (sort) {
      case "price-asc":  result.sort((a, b) => a.price - b.price); break;
      case "price-desc": result.sort((a, b) => b.price - a.price); break;
      default: result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return result;
  }, [properties, search, listing, category, landmarkCoords, landmark, radiusKm,
      priceMin, priceMax, sftMin, sftMax, sqYardMin, sqYardMax,
      bedrooms, furnishing, listedBy, sort, priceEffMax, sftEffMax, sqYardEffMax]);

  const propertiesWithCoords = filtered.filter((p) => p.lat && p.lng);
  const mapCenter: [number, number] = landmarkCoords
    ? [landmarkCoords.lat, landmarkCoords.lng]
    : propertiesWithCoords.length
      ? [propertiesWithCoords[0].lat!, propertiesWithCoords[0].lng!]
      : [17.4401, 78.3489];

  const handleMarkerClick = useCallback((p: Property) => {
    setHighlightedId(p.id);
    setSelectedProperty(p);
  }, []);

  // Contextual sliders to show
  const showSftSlider    = category !== "plot";
  const showSqYardSlider = category === "plot";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <style>{popupStyle}</style>
      <SEO title="Properties | Preinvesto" description="Browse properties for sale and rent in Hyderabad" />
      <Header />
      <div className="flex-1 pt-16 md:pt-20">

        {/* ── Sticky filter header ── */}
        <div className="bg-card border-b border-border sticky top-16 md:top-20 z-30">

          {/* Row 1: BUY / RENT / NEW PROJECTS + search + view controls */}
          <div className="container py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">

            {/* Listing type tabs */}
            <div className="flex border border-border rounded-md overflow-hidden shrink-0">
              <button onClick={() => setListing("")}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${listing === "" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                ALL
              </button>
              <button onClick={() => setListing("sale")}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${listing === "sale" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                BUY
              </button>
              <button onClick={() => setListing("rent")}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${listing === "rent" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                RENT
              </button>
              <button onClick={() => setListing("new")}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${listing === "new" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                NEW PROJECTS
              </button>
            </div>

            {/* Landmark + radius search */}
            <div className="flex-1 flex items-center gap-2">
              <div ref={lmWrapperRef} className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Search location, landmark, property..."
                  value={landmark || search}
                  onChange={(e) => handleLandmarkChange(e.target.value)}
                  onFocus={() => lmPredictions.length > 0 && setShowLmDropdown(true)}
                  className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {/* Custom predictions dropdown */}
                {showLmDropdown && lmPredictions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-background border border-border rounded-md shadow-lg z-50 overflow-hidden">
                    {lmPredictions.map((pred, i) => (
                      <div
                        key={pred.placeId}
                        onMouseDown={() => handleLmSelect(pred)}
                        className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-accent/10 ${i > 0 ? "border-t border-border" : ""}`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-foreground">{pred.mainText}</div>
                          {pred.secondaryText && (
                            <div className="text-xs text-muted-foreground mt-0.5">{pred.secondaryText}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Radius field — always visible */}
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number" min={1} max={50} step={1}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-2 py-2 border border-border rounded-md bg-background text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">km</span>
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm text-foreground hover:bg-muted transition-colors lg:hidden">
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </button>
            </div>

            {/* View + Add */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex border border-border rounded-md overflow-hidden">
                <button onClick={() => setView("list")} className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "list" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                  <List className="w-4 h-4" /> LIST
                </button>
                <button onClick={() => setView("map")} className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "map" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}>
                  <MapIcon className="w-4 h-4" /> MAP
                </button>
              </div>
              <Link to="/properties/add" className="flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-md hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> ADD
              </Link>
            </div>
          </div>

          {/* Row 2: BUILDING / PLOT / COMMERCIAL sub-tabs */}
          <div className="border-t border-border">
            <div className="container py-2 flex items-center gap-4">
              {([
                { val: "",           label: "All Types" },
                { val: "building",   label: "Building" },
                { val: "plot",       label: "Plot" },
                { val: "commercial", label: "Commercial" },
              ] as const).map(({ val, label }) => (
                <button key={val} onClick={() => setCategory(val)}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    category === val
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                {hasActiveFilters && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors whitespace-nowrap">
                    <X className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ── Main content area: sidebar + content ── */}
        <div className="relative flex" style={view === "map" ? { height: "calc(100vh - var(--header-offset, 8rem))" } : {}}>

          {/* Mobile overlay backdrop */}
          {showFilters && (
            <div
              className="fixed inset-0 bg-black/40 z-30 lg:hidden"
              onClick={() => setShowFilters(false)}
            />
          )}

          {/* Left sidebar */}
          <aside
            className={[
              "w-64 shrink-0 border-r border-border bg-background p-4 space-y-5 overflow-y-auto",
              view === "map" ? "h-full" : "",
              // Mobile: absolute overlay; Desktop: always visible
              "lg:relative lg:block lg:z-auto lg:shadow-none",
              showFilters
                ? "absolute z-40 top-0 left-0 h-full shadow-lg"
                : "hidden lg:block",
            ].join(" ")}
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Filters</span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-accent hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Price Range */}
            <DualRangeSlider
              label={isRent ? "Rent / mo" : "Price Range"}
              min={prRange.min} max={prRange.max} step={prRange.step}
              low={priceMin} high={priceMax}
              format={(v) => formatSliderPrice(v, isRent)}
              onLow={setPriceMin} onHigh={setPriceMax}
            />

            {/* Cost/sft or Rent/sft */}
            {showSftSlider && (
              <DualRangeSlider
                label={isRent ? "Rent / sft / mo" : "Cost / sft"}
                min={sftRange.min} max={sftRange.max} step={sftRange.step}
                low={sftMin} high={sftMax}
                format={(v) => `₹${v.toLocaleString("en-IN")}`}
                onLow={setSftMin} onHigh={setSftMax}
              />
            )}

            {/* Cost/sq yard (plot only) */}
            {showSqYardSlider && (
              <DualRangeSlider
                label={isRent ? "Rent / sq yd / mo" : "Cost / sq yd"}
                min={sqYardRange.min} max={sqYardRange.max} step={sqYardRange.step}
                low={sqYardMin} high={sqYardMax}
                format={(v) => `₹${v.toLocaleString("en-IN")}`}
                onLow={setSqYardMin} onHigh={setSqYardMax}
              />
            )}

            <hr className="border-border" />

            {/* Bedrooms — pill buttons, building only */}
            {category !== "plot" && category !== "commercial" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Bedrooms</p>
                <div className="flex flex-wrap gap-2">
                  {[{ label: "1 BHK", value: "1" }, { label: "2 BHK", value: "2" }, { label: "3 BHK", value: "3" }, { label: "4+ BHK", value: "4" }].map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setBedrooms(bedrooms === o.value ? "" : o.value)}
                      className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                        bedrooms === o.value
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-foreground hover:border-accent hover:text-accent"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Furnishing — not plot */}
            {category !== "plot" && (
              <div className="relative">
                <p className="text-xs text-muted-foreground mb-1">Furnishing</p>
                <select
                  value={furnishing}
                  onChange={(e) => setFurnishing(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent w-full"
                >
                  <option value="">Any Furnishing</option>
                  {FURNISHING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            )}

            {/* Listed By */}
            <div className="relative">
              <p className="text-xs text-muted-foreground mb-1">Listed By</p>
              <select
                value={listedBy}
                onChange={(e) => setListedBy(e.target.value)}
                className="appearance-none bg-card border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent w-full"
              >
                <option value="">Any</option>
                {LISTED_BY_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            <hr className="border-border" />

            {/* Sort */}
            <div className="relative">
              <p className="text-xs text-muted-foreground mb-1">Sort</p>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none bg-card border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent w-full"
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </aside>

          {/* Right content */}
          {view === "list" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="container py-6">
                <p className="text-sm text-muted-foreground mb-4">{filtered.length} properties found</p>
                {filtered.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <p className="text-lg font-medium">No properties match your filters</p>
                    <button onClick={clearFilters} className="mt-3 text-accent underline text-sm">Clear all filters</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((p) => <PropertyCard key={p.id} property={p} />)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0">
              <div className="flex-1 min-h-0" style={{ position: "relative", minHeight: "400px" }}>
                <MapContainer center={mapCenter} zoom={11} style={{ width: "100%", height: "100%", minHeight: "400px" }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler onMapClick={() => setSelectedProperty(null)} />
                  {landmarkCoords && (
                    <Circle
                      center={[landmarkCoords.lat, landmarkCoords.lng]}
                      radius={radiusKm * 1000}
                      pathOptions={{ color: "#C2570A", fillColor: "#C2570A", fillOpacity: 0.1, weight: 2 }}
                    />
                  )}
                  {propertiesWithCoords.map((p) => {
                    const allImages = [p.featuredImage, ...(p.galleryImages || [])].filter(Boolean);
                    const isSoldRented = p.status === 'sold' || p.status === 'rented';
                    const badge = isSoldRented
                      ? (p.status === 'sold' ? 'SOLD' : 'RENTED')
                      : (p.listingType === "rent" ? "For Rent" : "For Sale");
                    return (
                      <Marker
                        key={p.id}
                        position={[p.lat!, p.lng!]}
                        icon={isSoldRented ? redMarkerIcon : defaultMarkerIcon}
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
                                {p.propertyCategory === 'plot' ? (
                                  <>
                                    {p.plotArea != null && <span>{p.plotArea} sq.yd</span>}
                                    {p.plotLength != null && p.plotWidth != null && <span>{p.plotLength}×{p.plotWidth} ft</span>}
                                  </>
                                ) : (
                                  <>
                                    {p.bedrooms != null && <span>{p.bedrooms} BHK</span>}
                                    {p.bathrooms != null && <span>{p.bathrooms} Bath</span>}
                                    <span>{p.builtUpArea} sqft</span>
                                  </>
                                )}
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
        </div>{/* end relative flex */}
      </div>{/* end flex-1 pt-16 */}
      <WhatsAppButton />
    </div>
  );
};

export default Properties;
