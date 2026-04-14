import { Link } from "react-router-dom";
import { MapPin, BedDouble, Bath, Maximize } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useSoldProperties } from "@/hooks/useProperties";
import SEO from "@/components/SEO";

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") return `₹${price.toLocaleString("en-IN")}/mo`;
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString("en-IN")}`;
}

const SoldProperties = () => {
  const { properties, loading, error } = useSoldProperties();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Sold & Rented Properties | Preinvesto" description="Latest 50 sold and rented properties by Preinvesto." />
      <Header />
      <div className="flex-1 pt-20 md:pt-24 pb-10">
        <div className="container max-w-6xl">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Sold & Rented</h1>
            <p className="text-muted-foreground mt-2">Latest 50 properties that have been sold or rented.</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-20 text-destructive">{error}</div>
          )}

          {!loading && !error && properties.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">No sold or rented properties yet.</div>
          )}

          {!loading && !error && properties.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {properties.map((property) => (
                <Link
                  key={property.id}
                  to={`/properties/${property.id}`}
                  className="group bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <img
                      src={property.featuredImage}
                      alt={property.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                    />
                    {/* Status badge */}
                    <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full uppercase ${property.status === 'sold' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                      {property.status === 'sold' ? 'SOLD' : 'RENTED'}
                    </span>
                    {/* Listing type badge */}
                    <span className="absolute top-3 right-3 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded">
                      {property.listingType === "rent" ? "Rent" : "Sale"}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2 mb-1">
                      {property.title}
                    </p>
                    <div className="flex items-center gap-1 text-muted-foreground text-xs mb-3">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{property.locality}, {property.city}</span>
                    </div>

                    <div className="flex items-center gap-3 text-muted-foreground text-xs mb-3 flex-wrap">
                      {property.builtUpArea && (
                        <span className="flex items-center gap-1"><Maximize className="w-3 h-3" />{property.builtUpArea} sqft</span>
                      )}
                      {property.bedrooms != null && (
                        <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{property.bedrooms} BHK</span>
                      )}
                      {property.bathrooms != null && (
                        <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{property.bathrooms}</span>
                      )}
                    </div>

                    <p className="text-accent font-bold text-base">
                      {formatPrice(property.price, property.listingType)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <WhatsAppButton />
    </div>
  );
};

export default SoldProperties;
