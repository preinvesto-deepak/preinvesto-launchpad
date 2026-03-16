import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, X, ImageIcon } from "lucide-react";
import Header from "@/components/layout/Header";
import WhatsAppButton from "@/components/layout/WhatsAppButton";
import { useProperties } from "@/hooks/useProperties";
import {
  PROPERTY_TYPES,
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  PARKING_OPTIONS,
  AGE_OPTIONS,
  LISTED_BY_OPTIONS,
  STATUS_OPTIONS,
  AMENITIES_OPTIONS,
} from "@/data/propertiesSeed";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";

type FormErrors = Record<string, string>;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-display font-bold text-foreground border-b border-border pb-2 mb-4 mt-8 first:mt-0">{children}</h2>
);

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-sm font-medium text-foreground mb-1">
    {children}
    {required && <span className="text-destructive ml-0.5">*</span>}
  </label>
);

const FieldError = ({ error }: { error?: string }) =>
  error ? <p className="text-destructive text-xs mt-1">{error}</p> : null;

const PropertyAdd = () => {
  const navigate = useNavigate();
  const { addProperty } = useProperties();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FormErrors>({});

  // Form state
  const [listingType, setListingType] = useState<"sale" | "rent">("sale");
  const [propertyType, setPropertyType] = useState("");
  const [listedBy, setListedBy] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [maintenanceCharges, setMaintenanceCharges] = useState("");
  const [negotiable, setNegotiable] = useState(false);

  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [projectName, setProjectName] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [builtUpArea, setBuiltUpArea] = useState("");
  const [carpetArea, setCarpetArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [balconies, setBalconies] = useState("");
  const [floor, setFloor] = useState("");
  const [totalFloors, setTotalFloors] = useState("");
  const [facing, setFacing] = useState("");
  const [furnishing, setFurnishing] = useState("");
  const [parking, setParking] = useState("");
  const [propertyAge, setPropertyAge] = useState("");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [possessionStatus, setPossessionStatus] = useState("");

  const [amenities, setAmenities] = useState<string[]>([]);

  const [featuredPreview, setFeaturedPreview] = useState<string | null>(null);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [preferWhatsApp, setPreferWhatsApp] = useState(false);

  const isResidential = !["Commercial Office", "Shop", "Plot"].includes(propertyType);

  const handleFeaturedImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, featuredImage: "Image must be under 5MB" }));
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((prev) => ({ ...prev, featuredImage: "Only JPG, PNG, WEBP allowed" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFeaturedPreview(reader.result as string);
      setErrors((prev) => ({ ...prev, featuredImage: "" }));
    };
    reader.readAsDataURL(file);
  };

  const handleGalleryImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPreviews: string[] = [];
    const remaining = 10 - galleryPreviews.length;
    const toProcess = Array.from(files).slice(0, remaining);

    toProcess.forEach((file) => {
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;
      const reader = new FileReader();
      reader.onload = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === toProcess.length) {
          setGalleryPreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeGalleryImage = (index: number) => {
    setGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleAmenity = (a: string) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!propertyType) errs.propertyType = "Required";
    if (!listedBy) errs.listedBy = "Required";
    if (!title.trim()) errs.title = "Required";
    if (!description.trim() || description.trim().length < 20) errs.description = "Min 20 characters";
    if (!price || isNaN(Number(price)) || Number(price) <= 0) errs.price = "Enter a valid price";
    if (!city.trim()) errs.city = "Required";
    if (!locality.trim()) errs.locality = "Required";
    if (!builtUpArea || isNaN(Number(builtUpArea)) || Number(builtUpArea) <= 0) errs.builtUpArea = "Enter valid area";
    if (isResidential && (!bedrooms || isNaN(Number(bedrooms)))) errs.bedrooms = "Required for residential";
    if (isResidential && (!bathrooms || isNaN(Number(bathrooms)))) errs.bathrooms = "Required for residential";
    if (!possessionStatus) errs.possessionStatus = "Required";
    if (!furnishing) errs.furnishing = "Required";
    if (!featuredPreview) errs.featuredImage = "Featured image is required";
    if (!contactName.trim()) errs.contactName = "Required";
    if (!contactPhone.trim() || !/^[6-9]\d{9}$/.test(contactPhone.trim())) errs.contactPhone = "Enter valid 10-digit Indian number";
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errs.contactEmail = "Invalid email";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast({ title: "Please fix the errors", variant: "destructive" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // For demo: store image data URLs as the image sources
    // In production, these would upload to a storage service
    addProperty({
      listingType,
      propertyType,
      listedBy,
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      rentPerMonth: listingType === "rent" ? Number(price) : undefined,
      securityDeposit: securityDeposit ? Number(securityDeposit) : undefined,
      maintenanceCharges: maintenanceCharges ? Number(maintenanceCharges) : undefined,
      negotiable,
      city: city.trim(),
      locality: locality.trim(),
      projectName: projectName.trim() || undefined,
      fullAddress: fullAddress.trim() || undefined,
      landmark: landmark.trim() || undefined,
      pincode: pincode.trim() || undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      builtUpArea: Number(builtUpArea),
      carpetArea: carpetArea ? Number(carpetArea) : undefined,
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      balconies: balconies ? Number(balconies) : undefined,
      floor: floor ? Number(floor) : undefined,
      totalFloors: totalFloors ? Number(totalFloors) : undefined,
      facing: facing || undefined,
      furnishing,
      parking: parking || "None",
      propertyAge: propertyAge || "0-1 years",
      availabilityDate: availabilityDate || undefined,
      possessionStatus,
      amenities,
      featuredImage: featuredPreview || "/placeholder.svg",
      galleryImages: galleryPreviews,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim() || undefined,
      preferWhatsApp,
    });

    toast({ title: "Property listed successfully!" });
    navigate("/properties?sort=newest");
  };

  const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent";
  const selectClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent appearance-none";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Add Property | Preinvesto" description="List your property for sale or rent" />
      <Header />
      <div className="flex-1 pt-20 md:pt-24 pb-10">
        <div className="container max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">ADD YOUR PROPERTY</h1>
          <p className="text-muted-foreground text-sm mb-6">Fill in the details below to list your property.</p>

          <form onSubmit={handleSubmit} className="space-y-2">
            {/* A) Basic Details */}
            <SectionTitle>Basic Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>Listing Type</FieldLabel>
                <div className="flex gap-2">
                  {(["sale", "rent"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setListingType(t)}
                      className={`flex-1 py-2 text-sm rounded-md border transition-colors ${listingType === t ? "bg-accent text-accent-foreground border-accent" : "border-border text-foreground hover:bg-muted"}`}
                    >
                      {t === "sale" ? "For Sale" : "For Rent"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel required>Property Type</FieldLabel>
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <FieldError error={errors.propertyType} />
              </div>
              <div>
                <FieldLabel required>Listed By</FieldLabel>
                <select value={listedBy} onChange={(e) => setListedBy(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {LISTED_BY_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <FieldError error={errors.listedBy} />
              </div>
            </div>
            <div>
              <FieldLabel required>Property Title</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spacious 3BHK in Gachibowli" className={inputClass} />
              <FieldError error={errors.title} />
            </div>
            <div>
              <FieldLabel required>Description</FieldLabel>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe your property in detail..." className={inputClass} />
              <FieldError error={errors.description} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>{listingType === "rent" ? "Rent/Month (₹)" : "Price (₹)"}</FieldLabel>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 5000000" className={inputClass} />
                <FieldError error={errors.price} />
              </div>
              {listingType === "rent" && (
                <div>
                  <FieldLabel>Security Deposit (₹)</FieldLabel>
                  <input type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} className={inputClass} />
                </div>
              )}
              <div>
                <FieldLabel>Maintenance (₹/mo)</FieldLabel>
                <input type="number" value={maintenanceCharges} onChange={(e) => setMaintenanceCharges(e.target.value)} className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="accent-accent" />
              Price is negotiable
            </label>

            {/* B) Location */}
            <SectionTitle>Location</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>City</FieldLabel>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Hyderabad" className={inputClass} />
                <FieldError error={errors.city} />
              </div>
              <div>
                <FieldLabel required>Locality / Area</FieldLabel>
                <input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="e.g. Gachibowli" className={inputClass} />
                <FieldError error={errors.locality} />
              </div>
              <div>
                <FieldLabel>Project / Society Name</FieldLabel>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Landmark</FieldLabel>
                <input value={landmark} onChange={(e) => setLandmark(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Full Address</FieldLabel>
                <input value={fullAddress} onChange={(e) => setFullAddress(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Pincode</FieldLabel>
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 17.4401" className={inputClass} />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. 78.3489" className={inputClass} />
              </div>
            </div>

            {/* C) Property Features */}
            <SectionTitle>Property Features</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <div>
                <FieldLabel required>Built-up Area (sqft)</FieldLabel>
                <input type="number" value={builtUpArea} onChange={(e) => setBuiltUpArea(e.target.value)} className={inputClass} />
                <FieldError error={errors.builtUpArea} />
              </div>
              <div>
                <FieldLabel>Carpet Area (sqft)</FieldLabel>
                <input type="number" value={carpetArea} onChange={(e) => setCarpetArea(e.target.value)} className={inputClass} />
              </div>
              {isResidential && (
                <>
                  <div>
                    <FieldLabel required>Bedrooms (BHK)</FieldLabel>
                    <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={inputClass} />
                    <FieldError error={errors.bedrooms} />
                  </div>
                  <div>
                    <FieldLabel required>Bathrooms</FieldLabel>
                    <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={inputClass} />
                    <FieldError error={errors.bathrooms} />
                  </div>
                  <div>
                    <FieldLabel>Balconies</FieldLabel>
                    <input type="number" value={balconies} onChange={(e) => setBalconies(e.target.value)} className={inputClass} />
                  </div>
                </>
              )}
              <div>
                <FieldLabel>Floor</FieldLabel>
                <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Total Floors</FieldLabel>
                <input type="number" value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Facing</FieldLabel>
                <select value={facing} onChange={(e) => setFacing(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {FACING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel required>Furnishing</FieldLabel>
                <select value={furnishing} onChange={(e) => setFurnishing(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {FURNISHING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <FieldError error={errors.furnishing} />
              </div>
              <div>
                <FieldLabel>Parking</FieldLabel>
                <select value={parking} onChange={(e) => setParking(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {PARKING_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Property Age</FieldLabel>
                <select value={propertyAge} onChange={(e) => setPropertyAge(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel required>Possession Status</FieldLabel>
                <select value={possessionStatus} onChange={(e) => setPossessionStatus(e.target.value)} className={selectClass}>
                  <option value="">Select</option>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <FieldError error={errors.possessionStatus} />
              </div>
              <div>
                <FieldLabel>Availability Date</FieldLabel>
                <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* D) Amenities */}
            <SectionTitle>Amenities</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {AMENITIES_OPTIONS.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-foreground cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={amenities.includes(a)}
                    onChange={() => toggleAmenity(a)}
                    className="accent-accent"
                  />
                  {a}
                </label>
              ))}
            </div>

            {/* E) Media */}
            <SectionTitle>Media</SectionTitle>
            <div>
              <FieldLabel required>Featured Image</FieldLabel>
              <div
                onClick={() => featuredInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent transition-colors"
              >
                {featuredPreview ? (
                  <div className="relative inline-block">
                    <img src={featuredPreview} alt="Featured" className="max-h-40 rounded" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFeaturedPreview(null); }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-sm">Click to upload featured image</span>
                    <span className="text-xs">JPG, PNG, WEBP (max 5MB)</span>
                  </div>
                )}
              </div>
              <input ref={featuredInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFeaturedImage} className="hidden" />
              <FieldError error={errors.featuredImage} />
            </div>
            <div className="mt-4">
              <FieldLabel>Gallery Images (up to 10)</FieldLabel>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-3">
                {galleryPreviews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={src} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(i)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {galleryPreviews.length < 10 && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-accent transition-colors text-muted-foreground"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-xs mt-1">Add</span>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleGalleryImages} className="hidden" />
            </div>

            {/* F) Contact */}
            <SectionTitle>Contact Information</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Contact Name</FieldLabel>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
                <FieldError error={errors.contactName} />
              </div>
              <div>
                <FieldLabel required>Phone Number</FieldLabel>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="10-digit number" maxLength={10} className={inputClass} />
                <FieldError error={errors.contactPhone} />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
                <FieldError error={errors.contactEmail} />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer self-end pb-2">
                <input type="checkbox" checked={preferWhatsApp} onChange={(e) => setPreferWhatsApp(e.target.checked)} className="accent-accent" />
                Prefer WhatsApp
              </label>
            </div>

            {/* Submit */}
            <div className="pt-6 border-t border-border mt-8">
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
              >
                SUBMIT PROPERTY
              </button>
            </div>
          </form>
        </div>
      </div>
      <WhatsAppButton />
    </div>
  );
};

export default PropertyAdd;
