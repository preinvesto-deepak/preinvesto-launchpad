import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, BedDouble, Bath, Maximize, Phone, ChevronLeft, ChevronRight, Building2, Calendar, Car, Compass, Home, Layers } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useProperties } from "@/hooks/useProperties";
import SEO from "@/components/SEO";

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") return `₹${price.toLocaleString("en-IN")}/mo`;
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString("en-IN")}`;
}

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { properties } = useProperties();
  const property = useMemo(() => properties.find((p) => p.id === id), [properties, id]);
  const [currentImage, setCurrentImage] = useState(0);

  if (!property) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="text-center">
            <p className="text-muted-foreground text-lg">Property not found</p>
            <Link to="/properties" className="text-accent underline mt-2 inline-block">Back to Properties</Link>
          </div>
        </div>
      </div>
    );
  }

  const allImages = [property.featuredImage, ...property.galleryImages];

  const whatsappMsg = encodeURIComponent(`Hi, I'm interested in: ${property.title} - ${formatPrice(property.price, property.listingType)} (${property.locality}, ${property.city})`);
  const whatsappLink = `https://wa.me/91${property.contactPhone}?text=${whatsappMsg}`;

  const details = [
    { icon: Home, label: "Type", value: property.propertyType },
    { icon: Maximize, label: "Built-up Area", value: `${property.builtUpArea} sqft` },
    property.carpetArea ? { icon: Maximize, label: "Carpet Area", value: `${property.carpetArea} sqft` } : null,
    property.bedrooms != null ? { icon: BedDouble, label: "Bedrooms", value: `${property.bedrooms} BHK` } : null,
    property.bathrooms != null ? { icon: Bath, label: "Bathrooms", value: `${property.bathrooms}` } : null,
    property.balconies != null ? { icon: Layers, label: "Balconies", value: `${property.balconies}` } : null,
    property.floor != null ? { icon: Building2, label: "Floor", value: `${property.floor}${property.totalFloors ? ` / ${property.totalFloors}` : ""}` } : null,
    property.facing ? { icon: Compass, label: "Facing", value: property.facing } : null,
    { icon: Home, label: "Furnishing", value: property.furnishing },
    { icon: Car, label: "Parking", value: property.parking },
    { icon: Calendar, label: "Property Age", value: property.propertyAge },
    { icon: Home, label: "Possession", value: property.possessionStatus },
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title={`${property.title} | Preinvesto Properties`} description={property.description.slice(0, 160)} />
      <Header />
      <div className="flex-1 pt-20 md:pt-24 pb-10">
        <div className="container max-w-5xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Image Carousel */}
          <div className="relative rounded-xl overflow-hidden bg-muted mb-6">
            <div className="aspect-video relative">
              <img
                src={allImages[currentImage]}
                alt={property.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImage((prev) => (prev - 1 + allImages.length) % allImages.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-card/80 backdrop-blur p-2 rounded-full hover:bg-card transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <button
                    onClick={() => setCurrentImage((prev) => (prev + 1) % allImages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-card/80 backdrop-blur p-2 rounded-full hover:bg-card transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImage(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === currentImage ? "bg-accent" : "bg-card/60"}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto">
                {allImages.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-colors ${i === currentImage ? "border-accent" : "border-transparent"}`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <span className="inline-block bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded uppercase mb-2">
                      {property.listingType === "rent" ? "For Rent" : "For Sale"}
                    </span>
                    <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">{property.title}</h1>
                    <div className="flex items-center gap-1 text-muted-foreground mt-1">
                      <MapPin className="w-4 h-4" />
                      <span>{property.locality}, {property.city}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-accent font-bold text-2xl">{formatPrice(property.price, property.listingType)}</p>
                    {property.negotiable && <span className="text-xs text-muted-foreground">Negotiable</span>}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="bg-card rounded-lg border border-border p-5">
                <h2 className="font-semibold text-foreground mb-4">Property Details</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {details.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <d.icon className="w-4 h-4 text-accent shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{d.label}</p>
                        <p className="text-sm font-medium text-foreground">{d.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="bg-card rounded-lg border border-border p-5">
                <h2 className="font-semibold text-foreground mb-3">About this Property</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{property.description}</p>
              </div>

              {/* Amenities */}
              {property.amenities.length > 0 && (
                <div className="bg-card rounded-lg border border-border p-5">
                  <h2 className="font-semibold text-foreground mb-3">Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {property.amenities.map((a) => (
                      <span key={a} className="text-sm bg-muted text-foreground px-3 py-1.5 rounded-md">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              {(property.securityDeposit || property.maintenanceCharges || property.projectName || property.landmark) && (
                <div className="bg-card rounded-lg border border-border p-5">
                  <h2 className="font-semibold text-foreground mb-3">Additional Information</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {property.projectName && (
                      <div><span className="text-muted-foreground">Project:</span> <span className="text-foreground">{property.projectName}</span></div>
                    )}
                    {property.securityDeposit && (
                      <div><span className="text-muted-foreground">Security Deposit:</span> <span className="text-foreground">₹{property.securityDeposit.toLocaleString("en-IN")}</span></div>
                    )}
                    {property.maintenanceCharges && (
                      <div><span className="text-muted-foreground">Maintenance:</span> <span className="text-foreground">₹{property.maintenanceCharges.toLocaleString("en-IN")}/mo</span></div>
                    )}
                    {property.landmark && (
                      <div><span className="text-muted-foreground">Landmark:</span> <span className="text-foreground">{property.landmark}</span></div>
                    )}
                    {property.listedBy && (
                      <div><span className="text-muted-foreground">Listed By:</span> <span className="text-foreground">{property.listedBy}</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar - Contact */}
            <div className="space-y-4">
              <div className="bg-card rounded-lg border border-border p-5 sticky top-28">
                <h2 className="font-semibold text-foreground mb-4">Contact</h2>
                <p className="text-foreground font-medium">{property.contactName}</p>
                <p className="text-sm text-muted-foreground mb-4">{property.listedBy}</p>
                <div className="space-y-3">
                  <a
                    href={`tel:+91${property.contactPhone}`}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
                  >
                    <Phone className="w-4 h-4" /> CALL NOW
                  </a>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.591-.838-6.311-2.236l-.44-.366-3.065 1.027 1.027-3.065-.366-.44A9.955 9.955 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
                    WHATSAPP
                  </a>
                </div>
                {property.contactEmail && (
                  <a href={`mailto:${property.contactEmail}`} className="block text-center text-sm text-accent mt-3 hover:underline">
                    {property.contactEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <WhatsAppButton />
    </div>
  );
};

export default PropertyDetail;
