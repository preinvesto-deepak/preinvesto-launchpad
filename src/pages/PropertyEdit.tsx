import { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  OWNERSHIP_OPTIONS,
  BOUNDARY_WALL_OPTIONS,
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

const PropertyEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { properties, loading, updateProperty, submitting } = useProperties();
  const { toast } = useToast();
  const property = useMemo(() => properties.find((p) => p.id === id), [properties, id]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Initialise form state from existing property
  const [listingType, setListingType] = useState<"sale" | "rent">((property?.listingType as any) ?? "sale");
  const [propertyType, setPropertyType] = useState(property?.propertyType ?? "");
  const [listedBy, setListedBy] = useState(property?.listedBy ?? "");
  const [title, setTitle] = useState(property?.title ?? "");
  const [description, setDescription] = useState(property?.description ?? "");
  const [price, setPrice] = useState(String(property?.price ?? ""));
  const [securityDeposit, setSecurityDeposit] = useState(String(property?.securityDeposit ?? ""));
  const [maintenanceCharges, setMaintenanceCharges] = useState(String(property?.maintenanceCharges ?? ""));
  const [negotiable, setNegotiable] = useState(property?.negotiable ?? false);

  const [city, setCity] = useState(property?.city ?? "");
  const [locality, setLocality] = useState(property?.locality ?? "");
  const [projectName, setProjectName] = useState(property?.projectName ?? "");
  const [fullAddress, setFullAddress] = useState(property?.fullAddress ?? "");
  const [landmark, setLandmark] = useState(property?.landmark ?? "");
  const [pincode, setPincode] = useState(property?.pincode ?? "");
  const [lat, setLat] = useState(String(property?.lat ?? ""));
  const [lng, setLng] = useState(String(property?.lng ?? ""));

  const [builtUpArea, setBuiltUpArea] = useState(String(property?.builtUpArea ?? ""));
  const [carpetArea, setCarpetArea] = useState(String(property?.carpetArea ?? ""));
  const [bedrooms, setBedrooms] = useState(String(property?.bedrooms ?? ""));
  const [bathrooms, setBathrooms] = useState(String(property?.bathrooms ?? ""));
  const [balconies, setBalconies] = useState(String(property?.balconies ?? ""));
  const [floor, setFloor] = useState(String(property?.floor ?? ""));
  const [totalFloors, setTotalFloors] = useState(String(property?.totalFloors ?? ""));
  const [facing, setFacing] = useState(property?.facing ?? "");
  const [furnishing, setFurnishing] = useState(property?.furnishing ?? "");
  const [parking, setParking] = useState(property?.parking ?? "");
  const [propertyAge, setPropertyAge] = useState(property?.propertyAge ?? "");
  const [availabilityDate, setAvailabilityDate] = useState(property?.availabilityDate ?? "");
  const [possessionStatus, setPossessionStatus] = useState(property?.possessionStatus ?? "");

  const [amenities, setAmenities] = useState<string[]>(property?.amenities ?? []);

  // Featured image — keep existing URL or replace with new file
  const [featuredPreview, setFeaturedPreview] = useState<string | null>(property?.featuredImage ?? null);
  const [featuredFile, setFeaturedFile] = useState<File | null>(null);

  // Gallery — track existing URLs separately from new uploads
  const [existingGalleryUrls, setExistingGalleryUrls] = useState<string[]>(property?.galleryImages ?? []);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  const [contactName, setContactName] = useState(property?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(property?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(property?.contactEmail ?? "");
  const [preferWhatsApp, setPreferWhatsApp] = useState(property?.preferWhatsApp ?? false);

  // Category & new project
  const [propertyCategory, setPropertyCategory] = useState<"building" | "plot" | "commercial" | "">(
    (property?.propertyCategory as any) ?? ""
  );
  const [isNewProject, setIsNewProject] = useState(property?.isNewProject ?? false);

  // Plot-specific fields
  const [plotLength, setPlotLength] = useState(String(property?.plotLength ?? ""));
  const [plotWidth, setPlotWidth] = useState(String(property?.plotWidth ?? ""));
  const [plotArea, setPlotArea] = useState(String(property?.plotArea ?? ""));
  const [ownership, setOwnership] = useState(property?.ownership ?? "");
  const [facingRoadWidth, setFacingRoadWidth] = useState(String(property?.facingRoadWidth ?? ""));
  const [boundaryWall, setBoundaryWall] = useState(property?.boundaryWall ?? "");
  const [electricityConnection, setElectricityConnection] = useState(property?.electricityConnection ?? false);
  const [waterSupply, setWaterSupply] = useState(property?.waterSupply ?? false);
  const [sewageConnection, setSewageConnection] = useState(property?.sewageConnection ?? false);
  const [floorsAllowed, setFloorsAllowed] = useState(String(property?.floorsAllowed ?? ""));

  const isPlot = propertyCategory === "plot";
  const isResidential = !isPlot && !["Commercial Office", "Shop"].includes(propertyType);

  // Populate form once property loads from API
  useEffect(() => {
    if (!property) return;
    setListingType((property.listingType as any) ?? "sale");
    setPropertyType(property.propertyType ?? "");
    setListedBy(property.listedBy ?? "");
    setTitle(property.title ?? "");
    setDescription(property.description ?? "");
    setPrice(String(property.price ?? ""));
    setSecurityDeposit(String(property.securityDeposit ?? ""));
    setMaintenanceCharges(String(property.maintenanceCharges ?? ""));
    setNegotiable(property.negotiable ?? false);
    setCity(property.city ?? "");
    setLocality(property.locality ?? "");
    setProjectName(property.projectName ?? "");
    setFullAddress(property.fullAddress ?? "");
    setLandmark(property.landmark ?? "");
    setPincode(property.pincode ?? "");
    setLat(String(property.lat ?? ""));
    setLng(String(property.lng ?? ""));
    setBuiltUpArea(String(property.builtUpArea ?? ""));
    setCarpetArea(String(property.carpetArea ?? ""));
    setBedrooms(String(property.bedrooms ?? ""));
    setBathrooms(String(property.bathrooms ?? ""));
    setBalconies(String(property.balconies ?? ""));
    setFloor(String(property.floor ?? ""));
    setTotalFloors(String(property.totalFloors ?? ""));
    setFacing(property.facing ?? "");
    setFurnishing(property.furnishing ?? "");
    setParking(property.parking ?? "");
    setPropertyAge(property.propertyAge ?? "");
    setAvailabilityDate(property.availabilityDate ?? "");
    setPossessionStatus(property.possessionStatus ?? "");
    setAmenities(property.amenities ?? []);
    setFeaturedPreview(property.featuredImage ?? null);
    setExistingGalleryUrls(property.galleryImages ?? []);
    setContactName(property.contactName ?? "");
    setContactPhone(property.contactPhone ?? "");
    setContactEmail(property.contactEmail ?? "");
    setPreferWhatsApp(property.preferWhatsApp ?? false);
    setPropertyCategory((property.propertyCategory as any) ?? "");
    setIsNewProject(property.isNewProject ?? false);
    setPlotLength(String(property.plotLength ?? ""));
    setPlotWidth(String(property.plotWidth ?? ""));
    setPlotArea(String(property.plotArea ?? ""));
    setOwnership(property.ownership ?? "");
    setFacingRoadWidth(String(property.facingRoadWidth ?? ""));
    setBoundaryWall(property.boundaryWall ?? "");
    setElectricityConnection(property.electricityConnection ?? false);
    setWaterSupply(property.waterSupply ?? false);
    setSewageConnection(property.sewageConnection ?? false);
    setFloorsAllowed(String(property.floorsAllowed ?? ""));
  }, [property]);

  if (loading && !property) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center pt-20">
          <p className="text-muted-foreground">Loading property...</p>
        </div>
      </div>
    );
  }

  if (!loading && !property) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center pt-20">
          <p className="text-muted-foreground">Property not found.</p>
        </div>
      </div>
    );
  }

  const handleFeaturedImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErrors((p) => ({ ...p, featuredImage: "Max 5MB" })); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setErrors((p) => ({ ...p, featuredImage: "Only JPG/PNG/WEBP" })); return; }
    setFeaturedFile(file);
    const reader = new FileReader();
    reader.onload = () => { setFeaturedPreview(reader.result as string); setErrors((p) => ({ ...p, featuredImage: "" })); };
    reader.readAsDataURL(file);
  };

  const handleGalleryImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const totalExisting = existingGalleryUrls.length + galleryPreviews.length;
    const remaining = 10 - totalExisting;
    const toProcess = Array.from(files).slice(0, remaining);
    const newPreviews: string[] = [];
    const newFiles: File[] = [];
    toProcess.forEach((file) => {
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;
      newFiles.push(file);
      const reader = new FileReader();
      reader.onload = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === newFiles.length) {
          setGalleryPreviews((p) => [...p, ...newPreviews]);
          setGalleryFiles((p) => [...p, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeExistingGallery = (index: number) =>
    setExistingGalleryUrls((p) => p.filter((_, i) => i !== index));

  const removeNewGallery = (index: number) => {
    setGalleryPreviews((p) => p.filter((_, i) => i !== index));
    setGalleryFiles((p) => p.filter((_, i) => i !== index));
  };

  const toggleAmenity = (a: string) =>
    setAmenities((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!propertyType) errs.propertyType = "Required";
    if (!listedBy) errs.listedBy = "Required";
    if (!title.trim()) errs.title = "Required";
    if (!description.trim() || description.trim().length < 20) errs.description = "Min 20 characters";
    if (!price || isNaN(Number(price)) || Number(price) <= 0) errs.price = "Enter a valid price";
    if (!city.trim()) errs.city = "Required";
    if (!locality.trim()) errs.locality = "Required";
    if (!isPlot && (!builtUpArea || isNaN(Number(builtUpArea)) || Number(builtUpArea) <= 0)) errs.builtUpArea = "Enter valid area";
    if (!possessionStatus) errs.possessionStatus = "Required";
    if (!isPlot && !furnishing) errs.furnishing = "Required";
    if (!featuredPreview) errs.featuredImage = "Featured image required";
    if (!contactName.trim()) errs.contactName = "Required";
    if (!contactPhone.trim() || !/^[6-9]\d{9}$/.test(contactPhone.trim())) errs.contactPhone = "Enter valid 10-digit number";
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errs.contactEmail = "Invalid email";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) { toast({ title: "Please fix the errors", variant: "destructive" }); window.scrollTo({ top: 0, behavior: "smooth" }); return; }

    try {
      await updateProperty(
        property.id,
        {
          listingType,
          propertyType,
          propertyCategory: propertyCategory || undefined,
          isNewProject,
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
          builtUpArea: isPlot ? 0 : Number(builtUpArea),
          carpetArea: carpetArea ? Number(carpetArea) : undefined,
          bedrooms: bedrooms ? Number(bedrooms) : undefined,
          bathrooms: bathrooms ? Number(bathrooms) : undefined,
          balconies: balconies ? Number(balconies) : undefined,
          floor: floor ? Number(floor) : undefined,
          totalFloors: totalFloors ? Number(totalFloors) : undefined,
          facing: facing || undefined,
          furnishing: furnishing || "Unfurnished",
          parking: parking || "None",
          propertyAge: propertyAge || "0-1 years",
          availabilityDate: availabilityDate || undefined,
          possessionStatus,
          amenities,
          featuredImage: property.featuredImage,
          galleryImages: existingGalleryUrls,
          videoUrl: property.videoUrl,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim() || undefined,
          preferWhatsApp,
          plotLength: plotLength ? Number(plotLength) : undefined,
          plotWidth: plotWidth ? Number(plotWidth) : undefined,
          plotArea: plotArea ? Number(plotArea) : undefined,
          ownership: ownership || undefined,
          facingRoadWidth: facingRoadWidth ? Number(facingRoadWidth) : undefined,
          boundaryWall: boundaryWall || undefined,
          electricityConnection,
          waterSupply,
          sewageConnection,
          floorsAllowed: floorsAllowed ? Number(floorsAllowed) : undefined,
        },
        featuredFile,
        galleryFiles,
        existingGalleryUrls
      );
      toast({ title: "Property updated successfully!" });
      navigate(`/properties/${property.id}`);
    } catch (err: any) {
      toast({ title: "Failed to update property", description: err.message, variant: "destructive" });
    }
  };

  const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent";
  const selectClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent appearance-none";
  const totalGalleryCount = existingGalleryUrls.length + galleryPreviews.length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Edit Property | Preinvesto" description="Edit property listing" />
      <Header />
      <div className="flex-1 pt-20 md:pt-24 pb-10">
        <div className="container max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">EDIT PROPERTY</h1>
          <p className="text-muted-foreground text-sm mb-6">Update the details for this property listing.</p>

          <form onSubmit={handleSubmit} className="space-y-2">
            {/* A) Basic Details */}
            <SectionTitle>Basic Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <FieldLabel required>Listing Type</FieldLabel>
                <div className="flex gap-2">
                  {(["sale", "rent"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setListingType(t)}
                      className={`flex-1 py-2 text-sm rounded-md border transition-colors ${listingType === t ? "bg-accent text-accent-foreground border-accent" : "border-border text-foreground hover:bg-muted"}`}>
                      {t === "sale" ? "For Sale" : "For Rent"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Category</FieldLabel>
                <select value={propertyCategory} onChange={(e) => setPropertyCategory(e.target.value as any)} className={selectClass}>
                  <option value="">Select</option>
                  <option value="building">Building</option>
                  <option value="plot">Plot</option>
                  <option value="commercial">Commercial</option>
                </select>
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
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={isNewProject} onChange={(e) => setIsNewProject(e.target.checked)} className="accent-accent" />
              This is a New Project / Launch
            </label>
            <div>
              <FieldLabel required>Property Title</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              <FieldError error={errors.title} />
            </div>
            <div>
              <FieldLabel required>Description</FieldLabel>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClass} />
              <FieldError error={errors.description} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>{listingType === "rent" ? "Rent/Month (₹)" : "Price (₹)"}</FieldLabel>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
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
              <div><FieldLabel required>City</FieldLabel><input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} /><FieldError error={errors.city} /></div>
              <div><FieldLabel required>Locality / Area</FieldLabel><input value={locality} onChange={(e) => setLocality(e.target.value)} className={inputClass} /><FieldError error={errors.locality} /></div>
              <div><FieldLabel>Project / Society Name</FieldLabel><input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} /></div>
              <div><FieldLabel>Landmark</FieldLabel><input value={landmark} onChange={(e) => setLandmark(e.target.value)} className={inputClass} /></div>
              <div><FieldLabel>Full Address</FieldLabel><input value={fullAddress} onChange={(e) => setFullAddress(e.target.value)} className={inputClass} /></div>
              <div><FieldLabel>Pincode</FieldLabel><input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} className={inputClass} /></div>
              <div><FieldLabel>Latitude</FieldLabel><input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} /></div>
              <div><FieldLabel>Longitude</FieldLabel><input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} /></div>
            </div>

            {/* C) Property Features */}
            <SectionTitle>Property Features</SectionTitle>
            {isPlot ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                <div><FieldLabel>Plot Area (sq. yards)</FieldLabel><input type="number" step="0.01" value={plotArea} onChange={(e) => setPlotArea(e.target.value)} className={inputClass} /></div>
                <div><FieldLabel>Plot Length (ft)</FieldLabel><input type="number" step="0.1" value={plotLength} onChange={(e) => setPlotLength(e.target.value)} className={inputClass} /></div>
                <div><FieldLabel>Plot Width (ft)</FieldLabel><input type="number" step="0.1" value={plotWidth} onChange={(e) => setPlotWidth(e.target.value)} className={inputClass} /></div>
                <div>
                  <FieldLabel>Ownership</FieldLabel>
                  <select value={ownership} onChange={(e) => setOwnership(e.target.value)} className={selectClass}>
                    <option value="">Select</option>
                    {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Facing</FieldLabel>
                  <select value={facing} onChange={(e) => setFacing(e.target.value)} className={selectClass}>
                    <option value="">Select</option>
                    {FACING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div><FieldLabel>Facing Road Width (ft)</FieldLabel><input type="number" step="0.1" value={facingRoadWidth} onChange={(e) => setFacingRoadWidth(e.target.value)} className={inputClass} /></div>
                <div>
                  <FieldLabel>Boundary Wall</FieldLabel>
                  <select value={boundaryWall} onChange={(e) => setBoundaryWall(e.target.value)} className={selectClass}>
                    <option value="">Select</option>
                    {BOUNDARY_WALL_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div><FieldLabel>Floors Allowed</FieldLabel><input type="number" value={floorsAllowed} onChange={(e) => setFloorsAllowed(e.target.value)} className={inputClass} /></div>
                <div>
                  <FieldLabel required>Possession Status</FieldLabel>
                  <select value={possessionStatus} onChange={(e) => setPossessionStatus(e.target.value)} className={selectClass}>
                    <option value="">Select</option>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <FieldError error={errors.possessionStatus} />
                </div>
                <div className="col-span-2 sm:col-span-3 md:col-span-4 flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={electricityConnection} onChange={(e) => setElectricityConnection(e.target.checked)} className="accent-accent" />
                    Electricity Connection
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={waterSupply} onChange={(e) => setWaterSupply(e.target.checked)} className="accent-accent" />
                    Water Supply
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={sewageConnection} onChange={(e) => setSewageConnection(e.target.checked)} className="accent-accent" />
                    Sewage Connection
                  </label>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                <div><FieldLabel required>Built-up Area (sqft)</FieldLabel><input type="number" value={builtUpArea} onChange={(e) => setBuiltUpArea(e.target.value)} className={inputClass} /><FieldError error={errors.builtUpArea} /></div>
                <div><FieldLabel>Carpet Area (sqft)</FieldLabel><input type="number" value={carpetArea} onChange={(e) => setCarpetArea(e.target.value)} className={inputClass} /></div>
                {isResidential && (
                  <>
                    <div><FieldLabel>Bedrooms</FieldLabel><input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={inputClass} /></div>
                    <div><FieldLabel>Bathrooms</FieldLabel><input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={inputClass} /></div>
                    <div><FieldLabel>Balconies</FieldLabel><input type="number" value={balconies} onChange={(e) => setBalconies(e.target.value)} className={inputClass} /></div>
                  </>
                )}
                <div><FieldLabel>Floor</FieldLabel><input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} className={inputClass} /></div>
                <div><FieldLabel>Total Floors</FieldLabel><input type="number" value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} className={inputClass} /></div>
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
                <div><FieldLabel>Availability Date</FieldLabel><input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} className={inputClass} /></div>
              </div>
            )}

            {/* D) Amenities */}
            <SectionTitle>Amenities</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {AMENITIES_OPTIONS.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-foreground cursor-pointer py-1">
                  <input type="checkbox" checked={amenities.includes(a)} onChange={() => toggleAmenity(a)} className="accent-accent" />
                  {a}
                </label>
              ))}
            </div>

            {/* E) Media */}
            <SectionTitle>Media</SectionTitle>
            <div>
              <FieldLabel required>Featured Image</FieldLabel>
              <div onClick={() => featuredInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent transition-colors">
                {featuredPreview ? (
                  <div className="relative inline-block">
                    <img src={featuredPreview} alt="Featured" className="max-h-40 rounded" />
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFeaturedPreview(null); setFeaturedFile(null); }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
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
                {/* Existing gallery images */}
                {existingGalleryUrls.map((src, i) => (
                  <div key={`existing-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={src} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                    <button type="button" onClick={() => removeExistingGallery(i)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* New gallery images */}
                {galleryPreviews.map((src, i) => (
                  <div key={`new-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-accent">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeNewGallery(i)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-accent text-accent-foreground text-[9px] px-1 rounded">NEW</span>
                  </div>
                ))}
                {totalGalleryCount < 10 && (
                  <div onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-accent transition-colors text-muted-foreground">
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
              <div><FieldLabel required>Contact Name</FieldLabel><input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} /><FieldError error={errors.contactName} /></div>
              <div><FieldLabel required>Phone Number</FieldLabel><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={10} className={inputClass} /><FieldError error={errors.contactPhone} /></div>
              <div><FieldLabel>Email</FieldLabel><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} /><FieldError error={errors.contactEmail} /></div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer self-end pb-2">
                <input type="checkbox" checked={preferWhatsApp} onChange={(e) => setPreferWhatsApp(e.target.checked)} className="accent-accent" />
                Prefer WhatsApp
              </label>
            </div>

            {/* Submit */}
            <div className="pt-6 border-t border-border mt-8">
              <button type="submit" disabled={submitting}
                className="w-full sm:w-auto px-8 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "SAVING..." : "SAVE CHANGES"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <WhatsAppButton />
    </div>
  );
};

export default PropertyEdit;
