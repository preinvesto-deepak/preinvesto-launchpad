import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, MapPin, BedDouble, Bath, Maximize, X, List, Map as MapIcon, Plus, SlidersHorizontal, ChevronDown } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useProperties } from "@/hooks/useProperties";
import { PROPERTY_TYPES, FURNISHING_OPTIONS, LISTED_BY_OPTIONS, STATUS_OPTIONS } from "@/data/propertiesSeed";
import type { Property } from "@/data/propertiesSeed";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SEO from "@/components/SEO";

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const BUDGET_RANGES = [
  { label: "Any", min: 0, max: Infinity },
  { label: "Under ₹25L", min: 0, max: 2500000 },
  { label: "₹25L – ₹50L", min: 2500000, max: 5000000 },
  { label: "₹50L – ₹1Cr", min: 5000000, max: 10000000 },
  { label: "₹1Cr – ₹2Cr", min: 10000000, max: 20000000 },
  { label: "₹2Cr+", min: 20000000, max: Infinity },
  // Rent ranges
  { label: "Under ₹15K", min: 0, max: 15000 },
  { label: "₹15K – ₹30K", min: 15000, max: 30000 },
  { label: "₹30K – ₹50K", min: 30000, max: 50000 },
  { label: "₹50K+", min: 50000, max: Infinity },
];

const SORT_OPTIONS = [
  { label: "Newest First", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") {
    return `₹${price.toLocaleString("en-IN")}/mo`;
  }
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString("en-IN")}`;
}

const PropertyCard = ({ property, highlighted }: { property: Property; highlighted?: boolean }) => (
  <Link
    to={`/properties/${property.id}`}
    className={`block bg-card rounded-lg border overflow-hidden transition-shadow hover:shadow-lg ${highlighted ? "ring-2 ring-accent" : "border-border"}`}
  >
    <div className="relative h-48 bg-muted">
      <img
        src={property.featuredImage}
        alt={property.title}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/placeholder.svg";
        }}
      />
      <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded uppercase">
        {property.listingType === "rent" ? "For Rent" : "For Sale"}
      </span>
      {property.negotiable && (
        <span className="absolute top-2 right-2 bg-card/90 text-foreground text-xs px-2 py-1 rounded">
          Negotiable
        </span>
      )}
    </div>
    <div className="p-4 space-y-2">
      <h3 className="font-semibold text-foreground text-base line-clamp-1">{property.title}</h3>
      <p className="text-accent font-bold text-lg">{formatPrice(property.price, property.listingType)}</p>
      <div className="flex items-center gap-1 text-muted-foreground text-sm">
        <MapPin className="w-3.5 h-3.5" />
        <span className="line-clamp-1">{property.locality}, {property.city}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1 border-t border-border">
        {property.bedrooms != null && (
          <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{property.bedrooms} BHK</span>
        )}
        {property.bathrooms != null && (
          <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms} Bath</span>
        )}
        <span className="flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{property.builtUpArea} sqft</span>
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.propertyType}</span>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.furnishing}</span>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{property.possessionStatus}</span>
      </div>
    </div>
  </Link>
);

const SelectFilter = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none bg-card border border-border rounded-md px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent w-full"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
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

  // Filters
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [propertyType, setPropertyType] = useState(searchParams.get("type") || "");
  const [budget, setBudget] = useState(searchParams.get("budget") || "");
  const [bedrooms, setBedrooms] = useState(searchParams.get("beds") || "");
  const [bathrooms, setBathrooms] = useState(searchParams.get("baths") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [furnishing, setFurnishing] = useState(searchParams.get("furnishing") || "");
  const [listedBy, setListedBy] = useState(searchParams.get("listedBy") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");

  // Sync filters to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (view !== "list") params.view = view;
    if (search) params.q = search;
    if (propertyType) params.type = propertyType;
    if (budget) params.budget = budget;
    if (bedrooms) params.beds = bedrooms;
    if (bathrooms) params.baths = bathrooms;
    if (status) params.status = status;
    if (furnishing) params.furnishing = furnishing;
    if (listedBy) params.listedBy = listedBy;
    if (sort !== "newest") params.sort = sort;
    setSearchParams(params, { replace: true });
  }, [view, search, propertyType, budget, bedrooms, bathrooms, status, furnishing, listedBy, sort, setSearchParams]);

  const clearFilters = () => {
    setSearch("");
    setPropertyType("");
    setBudget("");
    setBedrooms("");
    setBathrooms("");
    setStatus("");
    setFurnishing("");
    setListedBy("");
    setSort("newest");
  };

  const hasActiveFilters = !!(search || propertyType || budget || bedrooms || bathrooms || status || furnishing || listedBy);

  const filtered = useMemo(() => {
    let result = [...properties];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
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
    if (status) result = result.filter((p) => p.possessionStatus === status);
    if (furnishing) result = result.filter((p) => p.furnishing === furnishing);
    if (listedBy) result = result.filter((p) => p.listedBy === listedBy);
    if (budget) {
      const range = BUDGET_RANGES.find((r) => r.label === budget);
      if (range) result = result.filter((p) => p.price >= range.min && p.price < range.max);
    }

    // Sort
    switch (sort) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [properties, search, propertyType, budget, bedrooms, bathrooms, status, furnishing, listedBy, sort]);

  const propertiesWithCoords = filtered.filter((p) => p.lat && p.lng);
  const mapCenter: [number, number] = propertiesWithCoords.length
    ? [propertiesWithCoords[0].lat!, propertiesWithCoords[0].lng!]
    : [17.4401, 78.3489];

  const budgetOptions = properties.some((p) => p.listingType === "rent")
    ? BUDGET_RANGES.map((r) => ({ label: r.label, value: r.label }))
    : BUDGET_RANGES.slice(0, 6).map((r) => ({ label: r.label, value: r.label }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Properties | Preinvesto" description="Browse properties for sale and rent in Hyderabad" />
      <Header />
      <div className="flex-1 pt-16 md:pt-20">
        {/* Top Bar */}
        <div className="bg-card border-b border-border sticky top-16 md:top-20 z-30">
          <div className="container py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <h1 className="font-display text-xl font-bold text-foreground shrink-0">PROPERTIES</h1>
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by location, property type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm text-foreground hover:bg-muted transition-colors lg:hidden"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex border border-border rounded-md overflow-hidden">
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "list" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}
                >
                  <List className="w-4 h-4" /> LIST
                </button>
                <button
                  onClick={() => setView("map")}
                  className={`flex items-center gap-1 px-3 py-2 text-sm transition-colors ${view === "map" ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}
                >
                  <MapIcon className="w-4 h-4" /> MAP
                </button>
              </div>
              <Link
                to="/properties/add"
                className="flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-md hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> ADD PROPERTY
              </Link>
            </div>
          </div>

          {/* Filter Bar */}
          <div className={`border-t border-border ${showFilters ? "block" : "hidden lg:block"}`}>
            <div className="container py-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <SelectFilter
                label="Property Type"
                value={propertyType}
                onChange={setPropertyType}
                options={PROPERTY_TYPES.map((t) => ({ label: t, value: t }))}
              />
              <SelectFilter
                label="Budget"
                value={budget}
                onChange={setBudget}
                options={budgetOptions}
              />
              <SelectFilter
                label="Bedrooms"
                value={bedrooms}
                onChange={setBedrooms}
                options={[
                  { label: "1 BHK", value: "1" },
                  { label: "2 BHK", value: "2" },
                  { label: "3 BHK", value: "3" },
                  { label: "4+ BHK", value: "4" },
                ]}
              />
              <SelectFilter
                label="Bathrooms"
                value={bathrooms}
                onChange={setBathrooms}
                options={[
                  { label: "1", value: "1" },
                  { label: "2", value: "2" },
                  { label: "3+", value: "3" },
                ]}
              />
              <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
              <SelectFilter label="Furnishing" value={furnishing} onChange={setFurnishing} options={FURNISHING_OPTIONS.map((f) => ({ label: f, value: f }))} />
              <SelectFilter label="Listed By" value={listedBy} onChange={setListedBy} options={LISTED_BY_OPTIONS.map((l) => ({ label: l, value: l }))} />
              <div className="flex items-center gap-2">
                <SelectFilter
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={SORT_OPTIONS}
                />
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-2 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors whitespace-nowrap"
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
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
                {filtered.map((p) => (
                  <PropertyCard key={p.id} property={p} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row" style={{ height: "calc(100vh - 10rem)" }}>
            {/* Map */}
            <div className="flex-1 min-h-[300px] lg:min-h-0">
              <MapContainer
                center={mapCenter}
                zoom={11}
                className="w-full h-full"
                style={{ minHeight: "300px" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {propertiesWithCoords.map((p) => (
                  <Marker
                    key={p.id}
                    position={[p.lat!, p.lng!]}
                    eventHandlers={{
                      click: () => setHighlightedId(p.id),
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{p.title}</strong>
                        <br />
                        <span>{formatPrice(p.price, p.listingType)}</span>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            {/* Scrollable list */}
            <div className="w-full lg:w-96 xl:w-[420px] overflow-y-auto border-l border-border bg-background p-4 space-y-4">
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
