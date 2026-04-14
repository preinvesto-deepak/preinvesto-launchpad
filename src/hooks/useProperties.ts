import { useEffect, useState, useCallback } from 'react';
import type { Property } from '@/data/propertiesSeed';

const API_URL = import.meta.env.VITE_API_URL || '';

function parseJsonField(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function mapRow(row: any): Property {
  return {
    id: row.id,
    listingType: row.listing_type,
    propertyType: row.property_type,
    listedBy: row.listed_by,
    title: row.title,
    description: row.description,
    price: parseFloat(row.price) || 0,
    rentPerMonth: row.rent_per_month != null ? parseFloat(row.rent_per_month) : null,
    securityDeposit: row.security_deposit != null ? parseFloat(row.security_deposit) : null,
    maintenanceCharges: row.maintenance_charges != null ? parseFloat(row.maintenance_charges) : null,
    negotiable: Boolean(row.negotiable),
    city: row.city,
    locality: row.locality,
    projectName: row.project_name,
    fullAddress: row.full_address,
    landmark: row.landmark,
    pincode: row.pincode,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    builtUpArea: parseInt(row.built_up_area) || 0,
    carpetArea: row.carpet_area != null ? parseInt(row.carpet_area) : null,
    bedrooms: row.bedrooms != null ? parseInt(row.bedrooms) : null,
    bathrooms: row.bathrooms != null ? parseInt(row.bathrooms) : null,
    balconies: row.balconies != null ? parseInt(row.balconies) : null,
    floor: row.floor != null ? parseInt(row.floor) : null,
    totalFloors: row.total_floors != null ? parseInt(row.total_floors) : null,
    facing: row.facing,
    furnishing: row.furnishing,
    parking: row.parking,
    propertyAge: row.property_age,
    availabilityDate: row.availability_date,
    possessionStatus: row.possession_status,
    amenities: parseJsonField(row.amenities),
    featuredImage: row.featured_image,
    galleryImages: parseJsonField(row.gallery_images),
    videoUrl: row.video_url,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    preferWhatsApp: Boolean(row.prefer_whatsapp),
    status: row.status ?? 'available',
    reviewStatus: row.review_status ?? 'pending',
    soldAt: row.sold_at ?? null,
    createdAt: row.created_at,
    propertyCategory: row.property_category ?? null,
    isNewProject: Boolean(row.is_new_project),
    plotLength: row.plot_length != null ? parseFloat(row.plot_length) : null,
    plotWidth: row.plot_width != null ? parseFloat(row.plot_width) : null,
    plotArea: row.plot_area != null ? parseFloat(row.plot_area) : null,
    ownership: row.ownership ?? null,
    facingRoadWidth: row.facing_road_width != null ? parseFloat(row.facing_road_width) : null,
    boundaryWall: row.boundary_wall ?? null,
    electricityConnection: Boolean(row.electricity_connection),
    waterSupply: Boolean(row.water_supply),
    sewageConnection: Boolean(row.sewage_connection),
    floorsAllowed: row.floors_allowed != null ? parseInt(row.floors_allowed) : null,
  };
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/upload_image.php`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const { url } = await res.json();
  return url;
}

function buildPayload(property: Omit<Property, 'id' | 'createdAt' | 'status'>, featuredImage: string, galleryImages: string[]) {
  return {
    listing_type:        property.listingType,
    property_type:       property.propertyType,
    listed_by:           property.listedBy,
    title:               property.title,
    description:         property.description,
    price:               property.price,
    rent_per_month:      property.rentPerMonth      ?? null,
    security_deposit:    property.securityDeposit   ?? null,
    maintenance_charges: property.maintenanceCharges ?? null,
    negotiable:          property.negotiable,
    city:                property.city,
    locality:            property.locality,
    project_name:        property.projectName       ?? null,
    full_address:        property.fullAddress        ?? null,
    landmark:            property.landmark          ?? null,
    pincode:             property.pincode           ?? null,
    lat:                 property.lat               ?? null,
    lng:                 property.lng               ?? null,
    built_up_area:       property.builtUpArea,
    carpet_area:         property.carpetArea        ?? null,
    bedrooms:            property.bedrooms          ?? null,
    bathrooms:           property.bathrooms         ?? null,
    balconies:           property.balconies         ?? null,
    floor:               property.floor             ?? null,
    total_floors:        property.totalFloors       ?? null,
    facing:              property.facing            ?? null,
    furnishing:          property.furnishing,
    parking:             property.parking,
    property_age:        property.propertyAge,
    availability_date:   property.availabilityDate  ?? null,
    possession_status:   property.possessionStatus,
    amenities:           property.amenities,
    featured_image:      featuredImage,
    gallery_images:      galleryImages,
    video_url:           property.videoUrl          ?? null,
    contact_name:        property.contactName,
    contact_phone:       property.contactPhone,
    contact_email:       property.contactEmail      ?? null,
    prefer_whatsapp:     property.preferWhatsApp,
    property_category:   property.propertyCategory  ?? null,
    is_new_project:      property.isNewProject       ?? false,
    plot_length:         property.plotLength         ?? null,
    plot_width:          property.plotWidth          ?? null,
    plot_area:           property.plotArea           ?? null,
    ownership:           property.ownership          ?? null,
    facing_road_width:   property.facingRoadWidth    ?? null,
    boundary_wall:       property.boundaryWall       ?? null,
    electricity_connection: property.electricityConnection ?? false,
    water_supply:        property.waterSupply        ?? false,
    sewage_connection:   property.sewageConnection   ?? false,
    floors_allowed:      property.floorsAllowed      ?? null,
  };
}

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/properties.php`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProperties((data ?? []).map(mapRow));
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  async function addProperty(
    property: Omit<Property, 'id' | 'createdAt' | 'status'>,
    featuredFile: File,
    galleryFiles: File[]
  ): Promise<void> {
    setSubmitting(true);
    try {
      const featuredImage = await uploadImage(featuredFile);
      const galleryImages = await Promise.all(galleryFiles.map(uploadImage));

      const res = await fetch(`${API_URL}/api/add_property.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(property, featuredImage, galleryImages)),
      });

      if (!res.ok) throw new Error('Failed to add property');
      await fetchProperties();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateProperty(
    id: string,
    property: Omit<Property, 'id' | 'createdAt' | 'status'>,
    featuredFile: File | null,
    newGalleryFiles: File[],
    existingGalleryUrls: string[]
  ): Promise<void> {
    setSubmitting(true);
    try {
      const featuredImage = featuredFile
        ? await uploadImage(featuredFile)
        : property.featuredImage;

      const uploadedNewGallery = await Promise.all(newGalleryFiles.map(uploadImage));
      const galleryImages = [...existingGalleryUrls, ...uploadedNewGallery];

      const res = await fetch(`${API_URL}/api/update_property.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...buildPayload(property, featuredImage, galleryImages) }),
      });

      if (!res.ok) throw new Error('Failed to update property');
      await fetchProperties();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: 'available' | 'sold' | 'rented'): Promise<void> {
    const res = await fetch(`${API_URL}/api/update_status.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    await fetchProperties();
  }

  async function deleteProperty(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/delete_property.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Failed to delete property');
    await fetchProperties();
  }

  async function updateReview(id: string, review_status: 'pending' | 'approved' | 'rejected' | 'flagged'): Promise<void> {
    const res = await fetch(`${API_URL}/api/update_review.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status }),
    });
    if (!res.ok) throw new Error('Failed to update review status');
  }

  return { properties, loading, error, submitting, addProperty, updateProperty, updateStatus, deleteProperty, updateReview };
}

// ---------------------------------------------------------------------------
// Hook for admin review page — fetches ALL properties regardless of status
// ---------------------------------------------------------------------------
export function useAdminProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin_review_properties.php`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProperties((data ?? []).map(mapRow));
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function updateReview(id: string, review_status: 'pending' | 'approved' | 'rejected' | 'flagged'): Promise<void> {
    const res = await fetch(`${API_URL}/api/update_review.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, review_status }),
    });
    if (!res.ok) throw new Error('Failed to update review status');
    await fetchAll();
  }

  async function deleteProperty(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/delete_property.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Failed to delete property');
    await fetchAll();
  }

  return { properties, loading, error, updateReview, deleteProperty, refetch: fetchAll };
}

// ---------------------------------------------------------------------------
// Separate hook for the Sold Properties page
// ---------------------------------------------------------------------------
export function useSoldProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/sold_properties.php`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setProperties((data ?? []).map((row: any) => ({
          ...row,
          listingType: row.listing_type,
          propertyType: row.property_type,
          listedBy: row.listed_by,
          rentPerMonth: row.rent_per_month,
          securityDeposit: row.security_deposit,
          maintenanceCharges: row.maintenance_charges,
          projectName: row.project_name,
          fullAddress: row.full_address,
          builtUpArea: row.built_up_area,
          carpetArea: row.carpet_area,
          totalFloors: row.total_floors,
          availabilityDate: row.availability_date,
          possessionStatus: row.possession_status,
          featuredImage: row.featured_image,
          galleryImages: row.gallery_images ?? [],
          videoUrl: row.video_url,
          contactName: row.contact_name,
          contactPhone: row.contact_phone,
          contactEmail: row.contact_email,
          preferWhatsApp: row.prefer_whatsapp,
          status: row.status,
          createdAt: row.created_at,
        })));
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { properties, loading, error };
}
