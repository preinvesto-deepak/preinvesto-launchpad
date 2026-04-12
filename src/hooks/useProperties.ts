import { useEffect, useState, useCallback } from 'react';
import type { Property } from '@/data/propertiesSeed';

const API_URL = import.meta.env.VITE_API_URL || '';

function mapRow(row: any): Property {
  return {
    id: row.id,
    listingType: row.listing_type,
    propertyType: row.property_type,
    listedBy: row.listed_by,
    title: row.title,
    description: row.description,
    price: row.price,
    rentPerMonth: row.rent_per_month,
    securityDeposit: row.security_deposit,
    maintenanceCharges: row.maintenance_charges,
    negotiable: row.negotiable,
    city: row.city,
    locality: row.locality,
    projectName: row.project_name,
    fullAddress: row.full_address,
    landmark: row.landmark,
    pincode: row.pincode,
    lat: row.lat,
    lng: row.lng,
    builtUpArea: row.built_up_area,
    carpetArea: row.carpet_area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    balconies: row.balconies,
    floor: row.floor,
    totalFloors: row.total_floors,
    facing: row.facing,
    furnishing: row.furnishing,
    parking: row.parking,
    propertyAge: row.property_age,
    availabilityDate: row.availability_date,
    possessionStatus: row.possession_status,
    amenities: row.amenities ?? [],
    featuredImage: row.featured_image,
    galleryImages: row.gallery_images ?? [],
    videoUrl: row.video_url,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    preferWhatsApp: row.prefer_whatsapp,
    createdAt: row.created_at,
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
    property: Omit<Property, 'id' | 'createdAt'>,
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
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) throw new Error('Failed to add property');
      await fetchProperties();
    } finally {
      setSubmitting(false);
    }
  }

  return { properties, loading, error, submitting, addProperty };
}
